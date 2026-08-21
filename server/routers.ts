import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import {
  attendanceRecords,
  branches,
  employeeCertificates,
  employees,
  kpiDefinitions,
  kpiRecords,
  leaveBalances,
  leaveRequests,
  payrollItems,
  payrollRuns,
  salaryStructures,
  shiftAssignments,
  shifts,
} from "../drizzle/schema";
import { calculateKpiScore, calculatePayroll } from "../shared/hr-calculations";
import { getDb, getEmployeeByUserId } from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const staffRoles = ["manager", "pharmacist", "employee"] as const;
const ownerRoles = ["admin", "owner"] as const;
const managerRoles = ["admin", "owner", "manager"] as const;

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
    createBranch: ownerProcedure.input(z.object({ name: z.string().trim().min(2).max(160), code: z.string().trim().min(2).max(32), address: z.string().trim().max(1000).optional() })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.insert(branches).values({ name: input.name, code: input.code.toUpperCase(), address: input.address || null });
      return { success: true };
    }),
  }),

  profile: router({
    mine: protectedProcedure.query(async ({ ctx }) => {
      const employee = await getEmployeeByUserId(ctx.user.id);
      return { user: ctx.user, employee: employee ?? null };
    }),
  }),

  dashboard: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const today = startOfDay();
      const role = ctx.user.role;

      if (hasRole(role, ownerRoles)) {
        const [activeBranches, activeEmployees, allKpis, latestRun] = await Promise.all([
          db.select().from(branches).where(eq(branches.isActive, "yes")),
          db.select().from(employees).where(eq(employees.employmentStatus, "active")),
          db.select().from(kpiRecords),
          db.select().from(payrollRuns).orderBy(desc(payrollRuns.createdAt)).limit(1),
        ]);
        const averageKpi = allKpis.length ? allKpis.reduce((total, item) => total + toNumber(item.score), 0) / allKpis.length : null;
        return { stats: [
          { value: String(activeBranches.length), hint: activeBranches.length ? "فروع نشطة ضمن النظام" : "أضف أول فرع للبدء" },
          { value: String(activeEmployees.length), hint: activeEmployees.length ? "ملفات موظفين نشطة" : "لا توجد ملفات موظفين" },
          { value: averageKpi === null ? "—" : `${Math.round(averageKpi)}%`, hint: averageKpi === null ? "يتطلب إدخال مؤشرات الأداء" : "متوسط مؤشرات الأداء المسجلة" },
          { value: latestRun[0]?.status === "paid" ? "مدفوع" : latestRun[0]?.status === "approved" ? "معتمد" : latestRun[0] ? "مسودة" : "مسودة", hint: latestRun[0] ? `مسير ${latestRun[0].month}/${latestRun[0].year}` : "يُنشأ عند اكتمال البيانات" },
        ] };
      }

      const employee = await requireEmployeeProfile(ctx.user.id);
      if (role === "manager") {
        const team = await db.select().from(employees).where(and(eq(employees.branchId, employee.branchId), eq(employees.employmentStatus, "active")));
        const ids = new Set(team.map(member => member.id));
        const [todayAttendance, todayAssignments, pendingRequests] = await Promise.all([
          db.select().from(attendanceRecords).where(eq(attendanceRecords.workDate, today)),
          db.select().from(shiftAssignments).where(eq(shiftAssignments.workDate, today)),
          db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")),
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
        ] };
      }

      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      const [assignment, attendance, balances, records] = await Promise.all([
        db.select({ assignment: shiftAssignments, shift: shifts }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), eq(shiftAssignments.workDate, today))).limit(1),
        db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, today))).limit(1),
        db.select().from(leaveBalances).where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, today.getFullYear()))).limit(1),
        db.select().from(kpiRecords).where(and(eq(kpiRecords.employeeId, employee.id), gte(kpiRecords.periodStart, from), lte(kpiRecords.periodEnd, endOfDay(today)))),
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
      ] };
      return { stats: [
        { value: assignment[0] ? `${String(assignment[0].shift.startTime).slice(0, 5)}` : "—", hint: assignment[0] ? `حتى ${String(assignment[0].shift.endTime).slice(0, 5)}` : "لم تُسند وردية بعد" },
        { value: todayAttendance?.checkInAt ? (todayAttendance.checkOutAt ? "مكتمل" : "حاضر") : "—", hint: todayAttendance?.lateMinutes ? `تأخير ${todayAttendance.lateMinutes} دقيقة` : "سجّل الحضور عند بدء العمل" },
        { value: remainingLeave === null ? "—" : `${remainingLeave} ي`, hint: remainingLeave === null ? "يظهر بعد إنشاء ملفك" : "الرصيد السنوي المتبقي" },
        { value: kpiScore === null ? "—" : `${Math.round(kpiScore)}%`, hint: kpiScore === null ? "ترتبط بالأهداف المسندة إليك" : "متوسط نتائجك الشهرية" },
      ] };
    }),
  }),

  employees: router({
    list: managerProcedure.input(z.object({ branchId: z.number().int().positive().optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const requestedBranchId = input?.branchId;
      if (requestedBranchId) await assertBranchScope(ctx.user, requestedBranchId);
      if (hasRole(ctx.user.role, ownerRoles)) {
        return requestedBranchId ? db.select().from(employees).where(eq(employees.branchId, requestedBranchId)).orderBy(asc(employees.fullName)) : db.select().from(employees).orderBy(asc(employees.fullName));
      }
      const manager = await requireEmployeeProfile(ctx.user.id);
      return db.select().from(employees).where(eq(employees.branchId, manager.branchId)).orderBy(asc(employees.fullName));
    }),
    create: managerProcedure.input(z.object({
      branchId: z.number().int().positive(), employeeCode: z.string().trim().min(2).max(32), fullName: z.string().trim().min(3).max(160), phone: z.string().trim().max(32).optional(), email: z.string().email().optional(), jobTitle: z.string().trim().min(2).max(120), role: z.enum(staffRoles), hireDate: z.coerce.date(), nationalId: z.string().trim().max(48).optional(),
    })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      await db.insert(employees).values({ ...input, phone: input.phone || null, email: input.email || null, nationalId: input.nationalId || null });
      return { success: true };
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
    listRuns: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select().from(payrollRuns).where(eq(payrollRuns.branchId, input.branchId)).orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
    }),
  }),
});

export type AppRouter = typeof appRouter;
