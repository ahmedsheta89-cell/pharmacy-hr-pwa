import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  accountLinkLogs,
  accountLinkRequests,
  attendanceRecords,
  branches,
  employeeAuditLogs,
  employeeCertificates,
  employees,
  kpiDefinitions,
  kpiRecords,
  leaveBalances,
  leaveRequests,
  notifications,
  payrollApprovals,
  payrollItems,
  payrollRuns,
  salaryStructures,
  shiftAssignments,
  shifts,
  users,
} from "../drizzle/schema";
import { calculateKpiScore, calculatePayroll } from "../shared/hr-calculations";
import { getDb, getEmployeeByUserId } from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const staffRoles = ["manager", "hr_manager", "pharmacist", "employee"] as const;
const ownerRoles = ["admin", "owner"] as const;
const managerRoles = ["admin", "owner", "manager"] as const;
const payrollRoles = ["admin", "owner", "manager", "hr_manager"] as const;
const employeeStatusValues = ["active", "inactive", "on_leave"] as const;
const accountLinkRequestStatusValues = ["pending", "approved", "rejected", "cancelled"] as const;
const employeeFieldLabels: Record<string, string> = { employeeCode: "الكود الوظيفي", fullName: "الاسم", phone: "الهاتف", email: "البريد الإلكتروني", jobTitle: "المسمى الوظيفي", role: "الدور", hireDate: "تاريخ التعيين", nationalId: "الرقم القومي", employmentStatus: "حالة الملف" };

function auditValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (field === "nationalId" || field === "phone") return `••••${String(value).slice(-4)}`;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(employeeFieldLabels).flatMap(field => {
    if (!Object.prototype.hasOwnProperty.call(after, field)) return [];
    const previous = auditValue(field, before[field]);
    const next = auditValue(field, after[field]);
    return previous === next ? [] : [{ field, label: employeeFieldLabels[field], before: previous, after: next }];
  });
}

function hasRole(role: string, permitted: readonly string[]) {
  return permitted.includes(role);
}

const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, ownerRoles)) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الإجراء متاح لمالك النظام فقط." });
  return next({ ctx });
});

const managerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, managerRoles)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية إدارة بيانات الفريق." });
  return next({ ctx });
});

const payrollProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, payrollRoles)) throw new TRPCError({ code: "FORBIDDEN", message: "ليس لديك صلاحية الوصول إلى مسيرات الرواتب." });
  return next({ ctx });
});

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر الوصول إلى قاعدة البيانات." });
  return db;
}

async function requireEmployeeProfile(userId: number) {
  const employee = await getEmployeeByUserId(userId);
  if (!employee) throw new TRPCError({ code: "FORBIDDEN", message: "لم يُربط حسابك بعد بملف موظف." });
  return employee;
}

async function assertBranchScope(user: { id: number; role: string }, branchId: number) {
  if (hasRole(user.role, ownerRoles)) return;
  const employee = await requireEmployeeProfile(user.id);
  if (employee.branchId !== branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا يمكنك الوصول إلى بيانات فرع آخر." });
}

function lateMinutesFromSchedule(checkInAt: Date, workDate: Date, startTime: string, graceMinutes: number) {
  const [hours = 0, minutes = 0] = String(startTime).split(":").map(Number);
  const scheduled = startOfDay(workDate);
  scheduled.setHours(hours, minutes + graceMinutes, 0, 0);
  return Math.max(0, Math.floor((checkInAt.getTime() - scheduled.getTime()) / 60000));
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  organization: router({
    listBranches: protectedProcedure.query(async () => {
      const db = await requireDb();
      return db.select().from(branches).orderBy(asc(branches.name));
    }),
    createBranch: ownerProcedure.input(z.object({ name: z.string().trim().min(2, "اسم الفرع يجب ألا يقل عن حرفين.").max(160), code: z.string().trim().max(32), address: z.string().trim().max(1000).optional() })).mutation(async ({ input }) => {
      if (!input.code) throw new TRPCError({ code: "BAD_REQUEST", message: "أدخل كوداً للفرع." });
      const db = await requireDb();
      const code = input.code.toUpperCase();
      const findExisting = () => db.select({ id: branches.id }).from(branches).where(eq(branches.code, code)).limit(1);
      if ((await findExisting()).length) return { success: true, existing: true };
      try {
        await db.insert(branches).values({ name: input.name, code, address: input.address || null });
      } catch {
        if ((await findExisting()).length) return { success: true, existing: true };
        throw new TRPCError({ code: "CONFLICT", message: "تعذر حفظ الفرع. تأكد من أن كود الفرع غير مستخدم ثم أعد المحاولة." });
      }
      return { success: true, existing: false };
    }),
  }),

  profile: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const employee = await getEmployeeByUserId(ctx.user.id);
      return { user: ctx.user, employee: employee ?? null };
    }),
    setupEmployeeProfile: ownerProcedure.input(z.object({ branchId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const existing = await getEmployeeByUserId(ctx.user.id);
      if (existing) return { success: true, existing: true, employeeId: existing.id };
      const db = await requireDb();
      const branch = (await db.select().from(branches).where(eq(branches.id, input.branchId)).limit(1))[0];
      if (!branch || branch.isActive !== "yes") throw new TRPCError({ code: "BAD_REQUEST", message: "اختر فرعاً نشطاً لإنشاء ملفك الوظيفي." });
      const employeeCode = `ADM-${ctx.user.id}`;
      await db.insert(employees).values({
        userId: ctx.user.id,
        branchId: input.branchId,
        employeeCode,
        fullName: ctx.user.name?.trim() || "مالك النظام",
        email: ctx.user.email ?? null,
        jobTitle: "مالك النظام",
        role: "manager",
        hireDate: startOfDay(),
        employmentStatus: "active",
      });
      const created = await getEmployeeByUserId(ctx.user.id);
      if (created) {
        await db.insert(employeeAuditLogs).values({ employeeId: created.id, branchId: created.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "created", changes: [{ field: "userId", label: "ربط الحساب", before: null, after: "تم ربط حساب مالك النظام" }] });
        await db.insert(accountLinkLogs).values({ employeeId: created.id, userId: ctx.user.id, branchId: created.branchId, action: "linked", source: "owner_self_setup", actorUserId: ctx.user.id, actorName: ctx.user.name ?? null });
        await db.insert(notifications).values({ userId: ctx.user.id, type: "account_linked", title: "تم ربط حسابك الوظيفي", body: "تم ربط حسابك بملفك الوظيفي بنجاح. يمكنك الآن استخدام خدمات الحضور وبوابة الموظف.", data: { employeeId: created.id } });
      }
      return { success: true, existing: false, employeeId: created?.id ?? null };
    }),
    unlinkedUsers: managerProcedure.query(async () => {
      const db = await requireDb();
      const [accounts, assignedEmployees] = await Promise.all([
        db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users),
        db.select({ userId: employees.userId }).from(employees),
      ]);
      const assignedUserIds = new Set(assignedEmployees.flatMap(employee => employee.userId ? [employee.userId] : []));
      return accounts.filter(account => !assignedUserIds.has(account.id));
    }),
  }),

  notifications: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      return db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(10);
    }),
    markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const notification = (await db.select().from(notifications).where(eq(notifications.id, input.notificationId)).limit(1))[0];
      if (!notification || notification.userId !== ctx.user.id) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على الإشعار." });
      if (!notification.readAt) await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, input.notificationId));
      return { success: true };
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const today = startOfDay();
      const role = ctx.user.role;

      if (hasRole(role, ownerRoles)) {
        const [activeBranches, activeEmployees, allKpis, latestRun, pendingLinkRequests, pendingLeaveRequests, payrollCandidates] = await Promise.all([
          db.select().from(branches).where(eq(branches.isActive, "yes")),
          db.select().from(employees).where(eq(employees.employmentStatus, "active")),
          db.select().from(kpiRecords),
          db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt)).limit(1),
          db.select({ id: accountLinkRequests.id }).from(accountLinkRequests).where(eq(accountLinkRequests.status, "pending")),
          db.select({ id: leaveRequests.id }).from(leaveRequests).where(eq(leaveRequests.status, "pending")),
          db.select({ id: payrollRuns.id, status: payrollRuns.status }).from(payrollRuns),
        ]);
        const averageKpi = allKpis.length ? allKpis.reduce((total, item) => total + toNumber(item.score), 0) / allKpis.length : null;
        return { stats: [
          { value: String(activeBranches.length), hint: activeBranches.length ? "فروع نشطة ضمن النظام" : "أضف أول فرع للبدء" },
          { value: String(activeEmployees.length), hint: activeEmployees.length ? "ملفات موظفين نشطة" : "لا توجد ملفات موظفين" },
          { value: averageKpi === null ? "—" : `${Math.round(averageKpi)}%`, hint: averageKpi === null ? "يتطلب إدخال مؤشرات الأداء" : "متوسط مؤشرات الأداء المسجلة" },
          { value: latestRun[0]?.status === "paid" ? "مدفوع" : latestRun[0]?.status === "approved" ? "معتمد" : latestRun[0] ? "مسودة" : "مسودة", hint: latestRun[0] ? `مسير ${latestRun[0].month}/${latestRun[0].year}` : "يُنشأ عند اكتمال البيانات" },
        ], taskBadges: {
          accountLinks: pendingLinkRequests.length,
          leaves: pendingLeaveRequests.length,
          payroll: payrollCandidates.filter(run => run.status === "pending_manager" || run.status === "pending_hr").length,
        } };
      }

      const employee = await requireEmployeeProfile(ctx.user.id);
      if (role === "manager") {
        const team = await db.select().from(employees).where(and(eq(employees.branchId, employee.branchId), eq(employees.employmentStatus, "active")));
        const ids = new Set(team.map(member => member.id));
        const [todayAttendance, todayAssignments, pendingRequests, payrollCandidates] = await Promise.all([
          db.select().from(attendanceRecords).where(eq(attendanceRecords.workDate, today)),
          db.select().from(shiftAssignments).where(eq(shiftAssignments.workDate, today)),
          db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")),
          db.select({ id: payrollRuns.id, status: payrollRuns.status }).from(payrollRuns).where(eq(payrollRuns.branchId, employee.branchId)),
        ]);
        const teamAttendance = todayAttendance.filter(record => ids.has(record.employeeId));
        const present = teamAttendance.filter(record => record.status === "present" || record.status === "late").length;
        const scheduled = todayAssignments.filter(assignment => ids.has(assignment.employeeId)).length;
        const pending = pendingRequests.filter(request => ids.has(request.employeeId)).length;
        const commitment = team.length ? Math.round((present / team.length) * 100) : null;
        return { stats: [
          { value: team.length ? `${present}/${team.length}` : "—", hint: team.length ? "الحاضرون من فريق اليوم" : "لا يوجد أعضاء في الفريق" },
          { value: String(scheduled), hint: scheduled ? "ورديات مسندة اليوم" : "أنشئ جدول الفرع أولاً" },
          { value: String(pending), hint: pending ? "طلبات بانتظار المراجعة" : "لا توجد طلبات معلقة" },
          { value: commitment === null ? "—" : `${commitment}%`, hint: commitment === null ? "يتحسب من سجلات الحضور" : "نسبة الحضور المسجل اليوم" },
        ], taskBadges: {
          accountLinks: 0,
          leaves: pending,
          payroll: payrollCandidates.filter(run => run.status === "pending_manager").length,
        } };
      }

      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const [assignment, attendance, balances, records, payrollCandidates] = await Promise.all([
        db.select({ assignment: shiftAssignments, shift: shifts }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), eq(shiftAssignments.workDate, today))).limit(1),
        db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, today))).limit(1),
        db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, today.getFullYear()))).limit(1),
        db.select().from(kpiRecords).where(and(eq(kpiRecords.employeeId, employee.id), gte(kpiRecords.periodStart, from), lte(kpiRecords.periodEnd, endOfDay(today)))),
        role === "hr_manager" ? db.select({ id: payrollRuns.id, status: payrollRuns.status }).from(payrollRuns).where(eq(payrollRuns.branchId, employee.branchId)) : Promise.resolve([]),
      ]);
      const todayAttendance = attendance[0];
      const balance = balances[0];
      const remainingLeave = balance ? Math.max(0, toNumber(balance.annualEntitlement) - toNumber(balance.annualUsed)) : null;
      const kpiScore = records.length ? records.reduce((total, record) => total + toNumber(record.score), 0) / records.length : null;
      if (role === "pharmacist") return { stats: [
        { value: assignment[0] ? `${String(assignment[0].shift.startTime).slice(0, 5)}` : "—", hint: assignment[0] ? `حتى ${String(assignment[0].shift.endTime).slice(0, 5)}` : "لم تُسند وردية بعد" },
        { value: todayAttendance?.workedMinutes ? `${Math.round(todayAttendance.workedMinutes / 60)} س` : "—", hint: todayAttendance?.checkInAt ? "ساعات محسوبة حتى الانصراف" : "تظهر مع التسجيل اليومي" },
        { value: kpiScore === null ? "—" : `${Math.round(kpiScore)}%`, hint: kpiScore === null ? "لم يُحدد هدف لهذا الشهر" : "متوسط نتائج المؤشرات" },
        { value: remainingLeave === null ? "—" : `${remainingLeave} ي`, hint: remainingLeave === null ? "يظهر عند إعداد الرصيد" : "الرصيد السنوي المتبقي" },
      ], taskBadges: { accountLinks: 0, leaves: 0, payroll: 0 } };
      return { stats: [
        { value: assignment[0] ? `${String(assignment[0].shift.startTime).slice(0, 5)}` : "—", hint: assignment[0] ? `حتى ${String(assignment[0].shift.endTime).slice(0, 5)}` : "لم تُسند وردية بعد" },
        { value: todayAttendance?.checkInAt ? (todayAttendance.checkOutAt ? "مكتمل" : "حاضر") : "—", hint: todayAttendance?.lateMinutes ? `تأخير ${todayAttendance.lateMinutes} دقيقة` : "سجّل الحضور عند بدء العمل" },
        { value: remainingLeave === null ? "—" : `${remainingLeave} ي`, hint: remainingLeave === null ? "يظهر بعد إنشاء ملفك" : "الرصيد السنوي المتبقي" },
        { value: kpiScore === null ? "—" : `${Math.round(kpiScore)}%`, hint: kpiScore === null ? "ترتبط بالأهداف المسندة إليك" : "متوسط نتائجك الشهرية" },
      ], taskBadges: {
        accountLinks: 0,
        leaves: 0,
        payroll: role === "hr_manager" ? payrollCandidates.filter(run => run.status === "pending_hr").length : 0,
      } };
    }),
  }),

  employees: router({
    list: managerProcedure.input(z.object({ branchId: z.number().int().positive().optional(), includeArchived: z.boolean().optional(), status: z.enum(employeeStatusValues).optional(), role: z.enum(staffRoles).optional(), search: z.string().trim().max(160).optional(), sortBy: z.enum(["name", "hireDate", "createdAt"]).optional(), sortDirection: z.enum(["asc", "desc"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const requestedBranchId = input?.branchId;
      if (requestedBranchId) await assertBranchScope(ctx.user, requestedBranchId);
      let records;
      if (hasRole(ctx.user.role, ownerRoles)) {
        records = requestedBranchId ? await db.select().from(employees).where(eq(employees.branchId, requestedBranchId)) : await db.select().from(employees);
      } else {
        const manager = await requireEmployeeProfile(ctx.user.id);
        records = await db.select().from(employees).where(eq(employees.branchId, manager.branchId));
      }
      const status = input?.status ?? (input?.includeArchived ? undefined : "active");
      const search = input?.search?.toLocaleLowerCase("ar-EG");
      const filtered = records.filter(record => (!status || record.employmentStatus === status) && (!input?.role || record.role === input.role) && (!search || [record.fullName, record.employeeCode, record.jobTitle, record.email ?? "", record.phone ?? ""].some(value => value.toLocaleLowerCase("ar-EG").includes(search))));
      const direction = input?.sortDirection === "desc" ? -1 : 1;
      return filtered.sort((a, b) => {
        if (input?.sortBy === "hireDate") return direction * (a.hireDate.getTime() - b.hireDate.getTime());
        if (input?.sortBy === "createdAt") return direction * (a.createdAt.getTime() - b.createdAt.getTime());
        return direction * a.fullName.localeCompare(b.fullName, "ar");
      });
    }),
    linkUser: ownerProcedure.input(z.object({ employeeId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      if (employee.userId && employee.userId !== input.userId) throw new TRPCError({ code: "CONFLICT", message: "ملف الموظف مرتبط بالفعل بحساب آخر." });
      const account = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على حساب المستخدم." });
      const alreadyLinked = (await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, input.userId)).limit(1))[0];
      if (alreadyLinked && alreadyLinked.id !== employee.id) throw new TRPCError({ code: "CONFLICT", message: "هذا الحساب مرتبط بالفعل بملف موظف آخر." });
      if (employee.userId === input.userId) return { success: true, existing: true };
      await db.update(employees).set({ userId: input.userId }).where(eq(employees.id, employee.id));
      await db.insert(employeeAuditLogs).values({ employeeId: employee.id, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "updated", changes: [{ field: "userId", label: "ربط الحساب", before: null, after: account.name ?? `حساب #${account.id}` }] });
      await db.insert(accountLinkLogs).values({ employeeId: employee.id, userId: input.userId, branchId: employee.branchId, action: "linked", source: "owner_direct", actorUserId: ctx.user.id, actorName: ctx.user.name ?? null });
      await db.insert(notifications).values({ userId: input.userId, type: "account_linked", title: "تم ربط حسابك الوظيفي", body: `تم ربط حسابك بنجاح بملفك الوظيفي: ${employee.fullName}.`, data: { employeeId: employee.id } });
      return { success: true, existing: false };
    }),
    unlinkUser: ownerProcedure.input(z.object({ employeeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      if (!employee.userId) return { success: true, existing: true };
      if (employee.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك فك ربط حسابك الشخصي من ملفك الوظيفي." });
      const linkedUser = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, employee.userId)).limit(1))[0];
      await db.update(employees).set({ userId: null }).where(eq(employees.id, employee.id));
      await db.insert(employeeAuditLogs).values({ employeeId: employee.id, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "updated", changes: [{ field: "userId", label: "فك ربط الحساب", before: linkedUser?.name ?? `حساب #${employee.userId}`, after: null }] });
      await db.insert(accountLinkLogs).values({ employeeId: employee.id, userId: employee.userId, branchId: employee.branchId, action: "unlinked", source: "owner_direct", actorUserId: ctx.user.id, actorName: ctx.user.name ?? null });
      await db.insert(notifications).values({ userId: employee.userId, type: "account_unlinked", title: "تم فك ربط حسابك الوظيفي", body: "تم فك ربط حسابك من ملف الموظف. تواصل مع الإدارة إذا كنت تعتقد أن هذا الإجراء غير صحيح.", data: { employeeId: employee.id } });
      return { success: true, existing: false };
    }),
    requestUserLink: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      if (employee.userId) throw new TRPCError({ code: "CONFLICT", message: "ملف الموظف مرتبط بالفعل بحساب مستخدم." });
      const account = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على حساب المستخدم." });
      const alreadyLinked = (await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, input.userId)).limit(1))[0];
      if (alreadyLinked) throw new TRPCError({ code: "CONFLICT", message: "هذا الحساب مرتبط بالفعل بملف موظف آخر." });
      const pending = (await db.select({ id: accountLinkRequests.id }).from(accountLinkRequests).where(and(eq(accountLinkRequests.employeeId, input.employeeId), eq(accountLinkRequests.userId, input.userId), eq(accountLinkRequests.status, "pending"))).limit(1))[0];
      if (pending) return { success: true, existing: true, requestId: pending.id };
      const inserted = await db.insert(accountLinkRequests).values({ employeeId: employee.id, userId: input.userId, branchId: employee.branchId, requestedByUserId: ctx.user.id, requestedByName: ctx.user.name ?? null });
      return { success: true, existing: false, requestId: Number(inserted[0].insertId) };
    }),
    pendingLinkRequests: ownerProcedure.query(async () => {
      const db = await requireDb();
      return db.select({ request: accountLinkRequests, employeeName: employees.fullName, employeeCode: employees.employeeCode, accountName: users.name, accountEmail: users.email }).from(accountLinkRequests).innerJoin(employees, eq(accountLinkRequests.employeeId, employees.id)).innerJoin(users, eq(accountLinkRequests.userId, users.id)).where(eq(accountLinkRequests.status, "pending")).orderBy(desc(accountLinkRequests.createdAt));
    }),
    reviewLinkRequest: ownerProcedure.input(z.object({ requestId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const request = (await db.select().from(accountLinkRequests).where(eq(accountLinkRequests.id, input.requestId)).limit(1))[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على طلب الربط." });
      if (request.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذا الطلب مسبقاً." });
      const reviewedAt = new Date();
      if (input.decision === "rejected") {
        await db.update(accountLinkRequests).set({ status: "rejected", reviewedByUserId: ctx.user.id, reviewedByName: ctx.user.name ?? null, reviewNote: input.note || null, reviewedAt }).where(eq(accountLinkRequests.id, request.id));
        return { success: true, status: "rejected" as const };
      }
      const employee = (await db.select().from(employees).where(eq(employees.id, request.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يعد ملف الموظف موجوداً." });
      if (employee.userId) throw new TRPCError({ code: "CONFLICT", message: "تم ربط ملف الموظف بحساب آخر بالفعل." });
      const account = (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, request.userId)).limit(1))[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "لم يعد حساب المستخدم موجوداً." });
      const alreadyLinked = (await db.select({ id: employees.id }).from(employees).where(eq(employees.userId, request.userId)).limit(1))[0];
      if (alreadyLinked) throw new TRPCError({ code: "CONFLICT", message: "هذا الحساب مرتبط بالفعل بملف موظف آخر." });
      await db.update(employees).set({ userId: request.userId }).where(eq(employees.id, employee.id));
      await db.update(accountLinkRequests).set({ status: "approved", reviewedByUserId: ctx.user.id, reviewedByName: ctx.user.name ?? null, reviewNote: input.note || null, reviewedAt }).where(eq(accountLinkRequests.id, request.id));
      await db.insert(employeeAuditLogs).values({ employeeId: employee.id, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "updated", changes: [{ field: "userId", label: "ربط الحساب بعد الاعتماد", before: null, after: account.name ?? `حساب #${account.id}` }] });
      await db.insert(accountLinkLogs).values({ employeeId: employee.id, userId: request.userId, branchId: employee.branchId, action: "linked", source: "owner_approved_request", requestId: request.id, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null });
      await db.insert(notifications).values({ userId: request.userId, type: "account_linked", title: "تم ربط حسابك الوظيفي", body: `اعتمد المالك طلب ربط حسابك بملفك الوظيفي: ${employee.fullName}.`, data: { employeeId: employee.id, requestId: request.id } });
      return { success: true, status: "approved" as const };
    }),
    linkHistory: managerProcedure.input(z.object({
      branchId: z.number().int().positive().optional(),
      employeeId: z.number().int().positive().optional(),
      action: z.enum(["linked", "unlinked"]).optional(),
      source: z.enum(["owner_direct", "owner_approved_request", "owner_self_setup"]).optional(),
      search: z.string().trim().max(120).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const isOwner = hasRole(ctx.user.role, ownerRoles);
      if (input?.branchId) await assertBranchScope(ctx.user, input.branchId);
      const manager = isOwner ? null : await requireEmployeeProfile(ctx.user.id);
      const scopedBranchId = input?.branchId ?? manager?.branchId;
      const conditions = [];
      if (scopedBranchId) conditions.push(eq(accountLinkLogs.branchId, scopedBranchId));
      if (input?.employeeId) conditions.push(eq(accountLinkLogs.employeeId, input.employeeId));
      if (input?.action) conditions.push(eq(accountLinkLogs.action, input.action));
      if (input?.source) conditions.push(eq(accountLinkLogs.source, input.source));
      if (input?.from) conditions.push(gte(accountLinkLogs.createdAt, startOfDay(input.from)));
      if (input?.to) conditions.push(lte(accountLinkLogs.createdAt, endOfDay(input.to)));
      const records = await db.select({ log: accountLinkLogs, employeeName: employees.fullName, employeeCode: employees.employeeCode, accountName: users.name, accountEmail: users.email })
        .from(accountLinkLogs)
        .innerJoin(employees, eq(accountLinkLogs.employeeId, employees.id))
        .leftJoin(users, eq(accountLinkLogs.userId, users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(accountLinkLogs.createdAt));
      const search = input?.search?.toLocaleLowerCase("ar-EG");
      if (!search) return records;
      return records.filter(record => [record.employeeName, record.employeeCode, record.accountName, record.accountEmail, record.log.actorName]
        .some(value => value?.toLocaleLowerCase("ar-EG").includes(search)));
    }),
    create: managerProcedure.input(z.object({
      branchId: z.number().int().positive(), employeeCode: z.string().trim().min(2).max(32), fullName: z.string().trim().min(3).max(160), phone: z.string().trim().max(32).optional(), email: z.string().email().optional(), jobTitle: z.string().trim().min(2).max(120), role: z.enum(staffRoles), hireDate: z.coerce.date(), nationalId: z.string().trim().max(48).optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const inserted = await db.insert(employees).values({ ...input, phone: input.phone || null, email: input.email || null, nationalId: input.nationalId || null });
      await db.insert(employeeAuditLogs).values({ employeeId: Number(inserted[0].insertId), branchId: input.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "created", changes: changedFields({}, input) });
      return { success: true };
    }),
    update: managerProcedure.input(z.object({
      employeeId: z.number().int().positive(), employeeCode: z.string().trim().min(2).max(32), fullName: z.string().trim().min(3).max(160), phone: z.string().trim().max(32).optional(), email: z.string().email().optional(), jobTitle: z.string().trim().min(2).max(120), role: z.enum(staffRoles), hireDate: z.coerce.date(), nationalId: z.string().trim().max(48).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      const changes = changedFields(employee as unknown as Record<string, unknown>, input);
      try {
        await db.update(employees).set({ employeeCode: input.employeeCode, fullName: input.fullName, phone: input.phone || null, email: input.email || null, jobTitle: input.jobTitle, role: input.role, hireDate: input.hireDate, nationalId: input.nationalId || null }).where(eq(employees.id, input.employeeId));
      } catch {
        throw new TRPCError({ code: "CONFLICT", message: "تعذر حفظ التعديلات. تأكد من أن الكود الوظيفي غير مستخدم." });
      }
      if (changes.length) await db.insert(employeeAuditLogs).values({ employeeId: input.employeeId, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "updated", changes });
      return { success: true };
    }),
    archive: managerProcedure.input(z.object({ employeeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      if (employee.userId === ctx.user.id && !hasRole(ctx.user.role, ownerRoles)) throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكنك أرشفة ملفك الشخصي." });
      await db.update(employees).set({ employmentStatus: "inactive" }).where(eq(employees.id, input.employeeId));
      await db.insert(employeeAuditLogs).values({ employeeId: input.employeeId, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "archived", changes: [{ field: "employmentStatus", label: "حالة الملف", before: auditValue("employmentStatus", employee.employmentStatus), after: "inactive" }] });
      return { success: true };
    }),
    restore: managerProcedure.input(z.object({ employeeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      await db.update(employees).set({ employmentStatus: "active" }).where(eq(employees.id, input.employeeId));
      await db.insert(employeeAuditLogs).values({ employeeId: input.employeeId, branchId: employee.branchId, actorUserId: ctx.user.id, actorName: ctx.user.name ?? null, action: "restored", changes: [{ field: "employmentStatus", label: "حالة الملف", before: auditValue("employmentStatus", employee.employmentStatus), after: "active" }] });
      return { success: true };
    }),
    auditLog: managerProcedure.input(z.object({
      employeeId: z.number().int().positive(),
      action: z.enum(["created", "updated", "archived", "restored"]).optional(),
      search: z.string().trim().max(120).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على ملف الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      const conditions = [eq(employeeAuditLogs.employeeId, input.employeeId)];
      if (input.action) conditions.push(eq(employeeAuditLogs.action, input.action));
      if (input.from) conditions.push(gte(employeeAuditLogs.createdAt, startOfDay(input.from)));
      if (input.to) conditions.push(lte(employeeAuditLogs.createdAt, endOfDay(input.to)));
      const records = await db.select().from(employeeAuditLogs).where(and(...conditions)).orderBy(desc(employeeAuditLogs.createdAt));
      const search = input.search?.toLocaleLowerCase("ar-EG");
      if (!search) return records;
      return records.filter(record => [record.action, record.actorName, ...record.changes.flatMap(change => [change.label, change.before, change.after])]
        .some(value => value?.toLocaleLowerCase("ar-EG").includes(search)));
    }),
  }),

  certificates: router({
    listForEmployee: managerProcedure.input(z.object({ employeeId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود." });
      await assertBranchScope(ctx.user, employee.branchId);
      return db.select().from(employeeCertificates).where(eq(employeeCertificates.employeeId, input.employeeId)).orderBy(desc(employeeCertificates.expiresOn), desc(employeeCertificates.createdAt));
    }),
    create: managerProcedure.input(z.object({
      employeeId: z.number().int().positive(),
      title: z.string().trim().min(2).max(180),
      issuer: z.string().trim().max(180).optional(),
      issuedOn: z.coerce.date().optional(),
      expiresOn: z.coerce.date().optional(),
      documentUrl: z.string().url().max(2000).optional(),
    }).refine(value => !value.issuedOn || !value.expiresOn || value.expiresOn >= value.issuedOn, { message: "تاريخ انتهاء الشهادة يجب أن يكون بعد تاريخ الإصدار." })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود." });
      await assertBranchScope(ctx.user, employee.branchId);
      await db.insert(employeeCertificates).values({
        employeeId: input.employeeId,
        title: input.title,
        issuer: input.issuer || null,
        issuedOn: input.issuedOn ? startOfDay(input.issuedOn) : null,
        expiresOn: input.expiresOn ? startOfDay(input.expiresOn) : null,
        documentUrl: input.documentUrl || null,
      });
      return { success: true };
    }),
  }),

  shifts: router({
    list: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = await getEmployeeByUserId(ctx.user.id);
      const branchId = input?.branchId ?? profile?.branchId;
      if (!branchId) return [];
      if (input?.branchId) await assertBranchScope(ctx.user, input.branchId);
      return db.select().from(shifts).where(eq(shifts.branchId, branchId)).orderBy(asc(shifts.startTime));
    }),
    create: managerProcedure.input(z.object({ branchId: z.number().int().positive(), name: z.string().trim().min(2).max(100), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/), graceMinutes: z.number().int().min(0).max(120).default(10), breakMinutes: z.number().int().min(0).max(360).default(0), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#0F766E") })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      await db.insert(shifts).values(input);
      return { success: true };
    }),
    assign: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), shiftId: z.number().int().positive(), workDate: z.coerce.date(), notes: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على الموظف." });
      await assertBranchScope(ctx.user, employee.branchId);
      const shift = (await db.select().from(shifts).where(eq(shifts.id, input.shiftId)).limit(1))[0];
      if (!shift || shift.branchId !== employee.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "الوردية لا تتبع فرع الموظف." });
      await db.insert(shiftAssignments).values({ employeeId: input.employeeId, shiftId: input.shiftId, workDate: startOfDay(input.workDate), notes: input.notes || null }).onDuplicateKeyUpdate({ set: { shiftId: input.shiftId, notes: input.notes || null, status: "scheduled" } });
      return { success: true };
    }),
    mine: protectedProcedure.input(z.object({ from: z.coerce.date(), to: z.coerce.date() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      return db.select({ assignment: shiftAssignments, shift: shifts }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), gte(shiftAssignments.workDate, startOfDay(input.from)), lte(shiftAssignments.workDate, endOfDay(input.to)))).orderBy(asc(shiftAssignments.workDate));
    }),
  }),

  attendance: router({
    mineToday: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      const date = startOfDay();
      const record = (await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, date))).limit(1))[0];
      return record ?? null;
    }),
    checkIn: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      const now = new Date();
      const workDate = startOfDay(now);
      const existing = (await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, workDate))).limit(1))[0];
      if (existing?.checkInAt) throw new TRPCError({ code: "CONFLICT", message: "تم تسجيل الحضور بالفعل اليوم." });
      const assignment = (await db.select({ assignmentId: shiftAssignments.id, startTime: shifts.startTime, graceMinutes: shifts.graceMinutes }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), eq(shiftAssignments.workDate, workDate))).limit(1))[0];
      const lateMinutes = assignment ? lateMinutesFromSchedule(now, workDate, String(assignment.startTime), assignment.graceMinutes) : 0;
      const status = lateMinutes > 0 ? "late" : "present" as const;
      if (existing) {
        await db.update(attendanceRecords).set({ checkInAt: now, lateMinutes, status, shiftAssignmentId: assignment?.assignmentId ?? null }).where(eq(attendanceRecords.id, existing.id));
      } else {
        await db.insert(attendanceRecords).values({ employeeId: employee.id, shiftAssignmentId: assignment?.assignmentId ?? null, workDate, checkInAt: now, lateMinutes, status });
      }
      return { success: true, lateMinutes };
    }),
    checkOut: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      const workDate = startOfDay();
      const record = (await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, workDate))).limit(1))[0];
      if (!record?.checkInAt) throw new TRPCError({ code: "BAD_REQUEST", message: "سجّل الحضور أولاً قبل الانصراف." });
      if (record.checkOutAt) throw new TRPCError({ code: "CONFLICT", message: "تم تسجيل الانصراف بالفعل." });
      const now = new Date();
      const workedMinutes = Math.max(0, Math.floor((now.getTime() - record.checkInAt.getTime()) / 60000));
      await db.update(attendanceRecords).set({ checkOutAt: now, workedMinutes }).where(eq(attendanceRecords.id, record.id));
      return { success: true, workedMinutes };
    }),
    teamToday: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select({ employee: employees, attendance: attendanceRecords }).from(employees).leftJoin(attendanceRecords, and(eq(employees.id, attendanceRecords.employeeId), eq(attendanceRecords.workDate, startOfDay()))).where(eq(employees.branchId, input.branchId)).orderBy(asc(employees.fullName));
    }),
  }),

  leaves: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      const [balances, requests] = await Promise.all([db.select().from(leaveBalances).where(eq(leaveBalances.employeeId, employee.id)), db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employee.id)).orderBy(desc(leaveRequests.createdAt))]);
      return { balances, requests };
    }),
    request: protectedProcedure.input(z.object({ leaveType: z.enum(["annual", "sick", "emergency", "unpaid"]), startDate: z.coerce.date(), endDate: z.coerce.date(), totalDays: z.number().positive().max(365), reason: z.string().trim().min(3).max(1000).optional() }).refine(value => value.endDate >= value.startDate, { message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية." })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      await db.insert(leaveRequests).values({ employeeId: employee.id, leaveType: input.leaveType, startDate: startOfDay(input.startDate), endDate: startOfDay(input.endDate), totalDays: String(input.totalDays), reason: input.reason || null });
      return { success: true };
    }),
    pending: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select({ request: leaveRequests, employee: employees }).from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id)).where(and(eq(employees.branchId, input.branchId), eq(leaveRequests.status, "pending"))).orderBy(desc(leaveRequests.createdAt));
    }),
    review: managerProcedure.input(z.object({ requestId: z.number().int().positive(), approve: z.boolean(), reviewerNote: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const request = (await db.select().from(leaveRequests).where(eq(leaveRequests.id, input.requestId)).limit(1))[0];
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "طلب الإجازة غير موجود." });
      if (request.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذا الطلب سابقاً." });
      const requestedEmployee = (await db.select().from(employees).where(eq(employees.id, request.employeeId)).limit(1))[0];
      if (!requestedEmployee) throw new TRPCError({ code: "NOT_FOUND", message: "ملف الموظف غير موجود." });
      await assertBranchScope(ctx.user, requestedEmployee.branchId);
      const reviewer = await requireEmployeeProfile(ctx.user.id);
      const status = input.approve ? "approved" : "rejected" as const;
      await db.update(leaveRequests).set({ status, reviewerNote: input.reviewerNote || null, reviewedByEmployeeId: reviewer.id, reviewedAt: new Date() }).where(eq(leaveRequests.id, request.id));
      if (input.approve && (request.leaveType === "annual" || request.leaveType === "sick")) {
        const year = request.startDate.getFullYear();
        const balance = (await db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, request.employeeId), eq(leaveBalances.year, year))).limit(1))[0];
        if (balance) {
          const field = request.leaveType === "annual" ? { annualUsed: String(toNumber(balance.annualUsed) + toNumber(request.totalDays)) } : { sickUsed: String(toNumber(balance.sickUsed) + toNumber(request.totalDays)) };
          await db.update(leaveBalances).set(field).where(eq(leaveBalances.id, balance.id));
        }
      }
      return { success: true };
    }),
  }),

  kpis: router({
    definitions: protectedProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const profile = await getEmployeeByUserId(ctx.user.id);
      const branchId = input?.branchId ?? profile?.branchId;
      if (!branchId) return [];
      if (input?.branchId) await assertBranchScope(ctx.user, input.branchId);
      return db.select().from(kpiDefinitions).where(and(eq(kpiDefinitions.branchId, branchId), eq(kpiDefinitions.isActive, "yes"))).orderBy(asc(kpiDefinitions.name));
    }),
    createDefinition: managerProcedure.input(z.object({ branchId: z.number().int().positive(), name: z.string().trim().min(2).max(160), category: z.enum(["sales", "operations", "service", "attendance"]), description: z.string().trim().max(1000).optional(), unit: z.enum(["currency", "number", "percentage", "minutes"]), targetValue: z.number().positive(), weight: z.number().positive().max(100).default(1), measurementPeriod: z.enum(["daily", "weekly", "monthly"]).default("monthly"), applicableRoles: z.array(z.enum(staffRoles)).min(1) })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      await db.insert(kpiDefinitions).values({ ...input, targetValue: String(input.targetValue), weight: String(input.weight), description: input.description || null, applicableRoles: input.applicableRoles });
      return { success: true };
    }),
    record: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), kpiDefinitionId: z.number().int().positive(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), actualValue: z.number().min(0), notes: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      const definition = (await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, input.kpiDefinitionId)).limit(1))[0];
      if (!employee || !definition || definition.branchId !== employee.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف أو المؤشر غير صالحين." });
      await assertBranchScope(ctx.user, employee.branchId);
      const score = calculateKpiScore(input.actualValue, toNumber(definition.targetValue));
      const recorder = await requireEmployeeProfile(ctx.user.id);
      await db.insert(kpiRecords).values({ employeeId: input.employeeId, kpiDefinitionId: input.kpiDefinitionId, periodStart: startOfDay(input.periodStart), periodEnd: startOfDay(input.periodEnd), actualValue: String(input.actualValue), targetValue: String(definition.targetValue), achievementPercentage: String(score), score: String(score), recordedByEmployeeId: recorder.id, notes: input.notes || null }).onDuplicateKeyUpdate({ set: { actualValue: String(input.actualValue), targetValue: String(definition.targetValue), achievementPercentage: String(score), score: String(score), recordedByEmployeeId: recorder.id, notes: input.notes || null } });
      return { success: true, score };
    }),
    mine: protectedProcedure.input(z.object({ from: z.coerce.date(), to: z.coerce.date() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = await requireEmployeeProfile(ctx.user.id);
      return db.select({ record: kpiRecords, definition: kpiDefinitions }).from(kpiRecords).innerJoin(kpiDefinitions, eq(kpiRecords.kpiDefinitionId, kpiDefinitions.id)).where(and(eq(kpiRecords.employeeId, employee.id), gte(kpiRecords.periodStart, startOfDay(input.from)), lte(kpiRecords.periodEnd, endOfDay(input.to)))).orderBy(desc(kpiRecords.periodEnd));
    }),
  }),

  payroll: router({
    configureSalary: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), basicSalary: z.number().positive(), housingAllowance: z.number().min(0).default(0), transportationAllowance: z.number().min(0).default(0), otherAllowances: z.number().min(0).default(0), maximumKpiBonus: z.number().min(0).default(0), lateDeductionPerMinute: z.number().min(0).default(0), effectiveFrom: z.coerce.date() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود." });
      await assertBranchScope(ctx.user, employee.branchId);
      await db.insert(salaryStructures).values({ ...input, basicSalary: String(input.basicSalary), housingAllowance: String(input.housingAllowance), transportationAllowance: String(input.transportationAllowance), otherAllowances: String(input.otherAllowances), maximumKpiBonus: String(input.maximumKpiBonus), lateDeductionPerMinute: String(input.lateDeductionPerMinute), effectiveFrom: startOfDay(input.effectiveFrom) });
      return { success: true };
    }),
    generate: managerProcedure.input(z.object({ branchId: z.number().int().positive(), year: z.number().int().min(2024).max(2100), month: z.number().int().min(1).max(12), workingDaysInMonth: z.number().int().min(1).max(31) })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const existing = (await db.select().from(payrollRuns).where(and(eq(payrollRuns.branchId, input.branchId), eq(payrollRuns.year, input.year), eq(payrollRuns.month, input.month))).limit(1))[0];
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "يوجد مسير رواتب لهذه الفترة بالفعل." });
      await db.insert(payrollRuns).values({ branchId: input.branchId, year: input.year, month: input.month });
      const run = (await db.select().from(payrollRuns).where(and(eq(payrollRuns.branchId, input.branchId), eq(payrollRuns.year, input.year), eq(payrollRuns.month, input.month))).limit(1))[0];
      if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "تعذر إنشاء مسير الرواتب." });
      const from = new Date(input.year, input.month - 1, 1);
      const to = new Date(input.year, input.month, 0);
      const team = await db.select().from(employees).where(and(eq(employees.branchId, input.branchId), eq(employees.employmentStatus, "active")));
      let createdItems = 0;
      for (const employee of team) {
        const salary = (await db.select().from(salaryStructures).where(and(eq(salaryStructures.employeeId, employee.id), lte(salaryStructures.effectiveFrom, to))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1))[0];
        if (!salary) continue;
        const [attendance, performance] = await Promise.all([
          db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), gte(attendanceRecords.workDate, from), lte(attendanceRecords.workDate, to))),
          db.select().from(kpiRecords).where(and(eq(kpiRecords.employeeId, employee.id), gte(kpiRecords.periodStart, from), lte(kpiRecords.periodEnd, to))),
        ]);
        const absentDays = attendance.filter(record => record.status === "absent").length;
        const lateMinutes = attendance.reduce((total, record) => total + record.lateMinutes, 0);
        const kpiScore = performance.length === 0 ? 0 : performance.reduce((total, record) => total + toNumber(record.score), 0) / performance.length;
        const calculation = calculatePayroll({ basicSalary: toNumber(salary.basicSalary), allowances: toNumber(salary.housingAllowance) + toNumber(salary.transportationAllowance) + toNumber(salary.otherAllowances), workingDaysInMonth: input.workingDaysInMonth, absentDays, lateMinutes, lateDeductionPerMinute: toNumber(salary.lateDeductionPerMinute), leaveDeduction: 0, kpiScore, maximumKpiBonus: toNumber(salary.maximumKpiBonus) });
        await db.insert(payrollItems).values({ payrollRunId: run.id, employeeId: employee.id, basicSalary: String(salary.basicSalary), totalAllowances: String(toNumber(salary.housingAllowance) + toNumber(salary.transportationAllowance) + toNumber(salary.otherAllowances)), kpiScore: String(kpiScore), kpiBonus: String(calculation.kpiBonus), lateDeduction: String(calculation.lateDeduction), absenceDeduction: String(calculation.absenceDeduction), leaveDeduction: "0", netSalary: String(calculation.netSalary), calculationSnapshot: { period: { year: input.year, month: input.month }, absentDays, lateMinutes, kpiScore, ...calculation } });
        createdItems += 1;
      }
      return { success: true, payrollRunId: run.id, createdItems };
    }),
    submitForApproval: payrollProcedure.input(z.object({ payrollRunId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, input.payrollRunId)).limit(1))[0];
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "مسير الرواتب غير موجود." });
      await assertBranchScope(ctx.user, run.branchId);
      if (run.status !== "draft" && run.status !== "rejected") throw new TRPCError({ code: "CONFLICT", message: "لا يمكن إرسال هذا المسير للاعتماد في حالته الحالية." });
      await db.update(payrollRuns).set({ status: "pending_manager" }).where(eq(payrollRuns.id, run.id));
      return { success: true, status: "pending_manager" as const };
    }),
    reviewApproval: payrollProcedure.input(z.object({ payrollRunId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]), note: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, input.payrollRunId)).limit(1))[0];
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "مسير الرواتب غير موجود." });
      await assertBranchScope(ctx.user, run.branchId);
      const isOwner = hasRole(ctx.user.role, ownerRoles);
      const isManager = ctx.user.role === "manager";
      const isHrManager = ctx.user.role === "hr_manager";
      const managerStage = run.status === "pending_manager" && (isManager || isOwner);
      const hrStage = run.status === "pending_hr" && (isHrManager || isOwner);
      if (!managerStage && !hrStage) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية اتخاذ هذا القرار في مرحلة الاعتماد الحالية." });
      const approver = await getEmployeeByUserId(ctx.user.id);
      const approvalStage = managerStage ? "manager" : "hr_manager";
      const nextStatus = input.decision === "rejected" ? "rejected" : managerStage ? "pending_hr" : "approved";
      await db.insert(payrollApprovals).values({ payrollRunId: run.id, approverEmployeeId: approver?.id ?? null, approvalStage, decision: input.decision, note: input.note || null });
      await db.update(payrollRuns).set({ status: nextStatus }).where(eq(payrollRuns.id, run.id));
      return { success: true, status: nextStatus };
    }),
    approvalHistory: payrollProcedure.input(z.object({ payrollRunId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const run = (await db.select().from(payrollRuns).where(eq(payrollRuns.id, input.payrollRunId)).limit(1))[0];
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "مسير الرواتب غير موجود." });
      await assertBranchScope(ctx.user, run.branchId);
      return db.select({ approval: payrollApprovals, approver: employees }).from(payrollApprovals).leftJoin(employees, eq(payrollApprovals.approverEmployeeId, employees.id)).where(eq(payrollApprovals.payrollRunId, input.payrollRunId)).orderBy(desc(payrollApprovals.createdAt));
    }),
    listRuns: payrollProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select().from(payrollRuns).where(eq(payrollRuns.branchId, input.branchId)).orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
    }),
  }),
});

export type AppRouter = typeof appRouter;
