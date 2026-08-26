import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  accountLinkLogs,
  accountLinkRequests,
  attendanceImportBatches,
  attendanceImportRows,
  attendanceRecords,
  attendancePolicies,
  attendanceRules,
  branches,
  chatConversations,
  chatMessages,
  customerContactLogs,
  deliveryEvents,
  deliveryLocationPings,
  deliveryOrders,
  deliveryProofImages,
  deliveryZones,
  employeeAuditLogs,
  employeeCertificates,
  employees,
  faqEntries,
  kpiDefinitions,
  kpiRecords,
  leaveBalances,
  leaveRequests,
  notifications,
  orderPortalAccounts,
  orderPortalStaff,
  payrollApprovals,
  payrollAdjustments,
  payrollItems,
  payrollRuns,
  quickReplies,
  salaryStructures,
  shiftAssignments,
  shifts,
  users,
} from "../drizzle/schema";
import { nanoid } from "nanoid";
import { calculateAttendanceCompliance, calculateKpiScore, calculatePayroll, calculateRuleAdjustment } from "../shared/hr-calculations";
import { getDb, getEmployeeByUserId } from "./db";
import { storageGet, storagePut } from "./storage";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

const staffRoles = ["manager", "hr_manager", "pharmacist", "employee"] as const;
const ownerRoles = ["admin", "owner"] as const;
const managerRoles = ["admin", "owner", "manager"] as const;
const payrollRoles = ["admin", "owner", "manager", "hr_manager"] as const;
const financialApproverRoles = ["admin", "owner", "hr_manager"] as const;
const employeeStatusValues = ["active", "inactive", "on_leave"] as const;
const accountLinkRequestStatusValues = ["pending", "approved", "rejected", "cancelled"] as const;
const deliveryStatusValues = ["draft", "contacted", "prepared", "ready", "assigned", "picked_up", "en_route", "delivered", "failed", "returned", "cancelled"] as const;
const orderManagerStatusValues = ["draft", "contacted", "prepared", "ready", "cancelled"] as const;
const ORDER_PORTAL_COOKIE = "pharmacy_order_portal";
const ORDER_PORTAL_SESSION_SECONDS = 12 * 60 * 60;
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

const financialApproverProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!hasRole(ctx.user.role, financialApproverRoles)) throw new TRPCError({ code: "FORBIDDEN", message: "يلزم اعتماد الموارد البشرية أو مالك النظام لهذه العملية المالية." });
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

function orderPortalCookieOptions(req: TrpcContext["req"]) {
  return { ...getSessionCookieOptions(req), maxAge: ORDER_PORTAL_SESSION_SECONDS * 1000 };
}

function orderPortalSecret() {
  return new TextEncoder().encode(`${ENV.cookieSecret}:order-portal-v1`);
}

function hashOrderPortalPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt-v1$${salt}$${hash}`;
}

function verifyOrderPortalPassword(password: string, stored: string) {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt-v1" || !salt || !expected) return false;
  const computed = scryptSync(password, salt, 64).toString("hex");
  return expected.length === computed.length && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(computed, "hex"));
}

async function signOrderPortalSession(account: typeof orderPortalAccounts.$inferSelect) {
  return new SignJWT({ accountId: account.id, sessionVersion: account.sessionVersion, scope: "order_portal" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ORDER_PORTAL_SESSION_SECONDS}s`)
    .sign(orderPortalSecret());
}

async function setOrderPortalSession(ctx: TrpcContext, account: typeof orderPortalAccounts.$inferSelect) {
  const token = await signOrderPortalSession(account);
  ctx.res.cookie(ORDER_PORTAL_COOKIE, token, orderPortalCookieOptions(ctx.req));
}

function clearOrderPortalSession(ctx: TrpcContext) {
  ctx.res.clearCookie(ORDER_PORTAL_COOKIE, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
}

async function requireOrderPortalAccount(ctx: TrpcContext) {
  const cookies = parseCookie(String(ctx.req.headers.cookie ?? ""));
  const token = cookies[ORDER_PORTAL_COOKIE];
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED", message: "سجّل الدخول بحساب الصيدلية أولاً." });
  try {
    const { payload } = await jwtVerify(token, orderPortalSecret(), { algorithms: ["HS256"] });
    if (payload.scope !== "order_portal" || !Number.isInteger(payload.accountId) || !Number.isInteger(payload.sessionVersion)) throw new Error("invalid portal session");
    const db = await requireDb();
    const account = (await db.select().from(orderPortalAccounts).where(eq(orderPortalAccounts.id, Number(payload.accountId))).limit(1))[0];
    if (!account || account.isActive !== "yes" || account.sessionVersion !== Number(payload.sessionVersion)) throw new Error("expired portal session");
    return account;
  } catch {
    clearOrderPortalSession(ctx);
    throw new TRPCError({ code: "UNAUTHORIZED", message: "انتهت جلسة حساب الصيدلية. سجّل الدخول مرة أخرى." });
  }
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

function timeOnWorkDate(workDate: Date, value: string, nextDay = false) {
  const [hours = 0, minutes = 0] = String(value).split(":").map(Number);
  const result = startOfDay(workDate);
  result.setHours(hours, minutes, 0, 0);
  if (nextDay) result.setDate(result.getDate() + 1);
  return result;
}

function scheduledMinutesForShift(workDate: Date, shift: { startTime: string | Date; endTime: string | Date; breakMinutes: number }) {
  const start = timeOnWorkDate(workDate, String(shift.startTime));
  const end = timeOnWorkDate(workDate, String(shift.endTime), String(shift.endTime) <= String(shift.startTime));
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000) - Math.max(shift.breakMinutes, 0));
}

function attendanceRuleMetricValue(metric: "late_minutes" | "late_occurrences" | "absence_days" | "early_leave_minutes" | "overtime_minutes", summary: { totalLateMinutes: number; absentDays: number; earlyLeaveMinutes: number; overtimeMinutes: number }, lateOccurrences: number) {
  if (metric === "late_minutes") return summary.totalLateMinutes;
  if (metric === "late_occurrences") return lateOccurrences;
  if (metric === "absence_days") return summary.absentDays;
  if (metric === "early_leave_minutes") return summary.earlyLeaveMinutes;
  return summary.overtimeMinutes;
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
      const [assignment, policy] = await Promise.all([
        db.select({ assignmentId: shiftAssignments.id, startTime: shifts.startTime, graceMinutes: shifts.graceMinutes }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), eq(shiftAssignments.workDate, workDate))).limit(1).then(rows => rows[0]),
        db.select().from(attendancePolicies).where(eq(attendancePolicies.branchId, employee.branchId)).limit(1).then(rows => rows[0]),
      ]);
      const lateMinutes = assignment ? lateMinutesFromSchedule(now, workDate, String(assignment.startTime), policy?.isActive === "yes" ? policy.graceMinutes : assignment.graceMinutes) : 0;
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
    importRecords: managerProcedure.input(z.object({
      branchId: z.number().int().positive(),
      sourceFileName: z.string().trim().min(1).max(255),
      sourceFormat: z.enum(["xlsx", "csv"]),
      replaceExisting: z.boolean().default(false),
      confirmApply: z.literal(true),
      rows: z.array(z.object({
        employeeCode: z.string().trim().min(1).max(64),
        workDate: z.coerce.date(),
        checkInAt: z.coerce.date().optional(),
        checkOutAt: z.coerce.date().optional(),
        status: z.enum(["present", "absent", "excused"]).optional(),
      })).min(1).max(2000),
    })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const dates = input.rows.map(row => startOfDay(row.workDate));
      const periodStart = new Date(Math.min(...dates.map(value => value.getTime())));
      const periodEnd = new Date(Math.max(...dates.map(value => value.getTime())));
      const branchEmployees = await db.select().from(employees).where(and(eq(employees.branchId, input.branchId), eq(employees.employmentStatus, "active")));
      const employeeByCode = new Map(branchEmployees.map(employee => [employee.employeeCode.trim().toUpperCase(), employee]));
      const existingRows = await db.select({ record: attendanceRecords, employee: employees }).from(attendanceRecords).innerJoin(employees, eq(attendanceRecords.employeeId, employees.id)).where(and(eq(employees.branchId, input.branchId), gte(attendanceRecords.workDate, periodStart), lte(attendanceRecords.workDate, periodEnd)));
      const existingByEmployeeDate = new Map(existingRows.map(row => [`${row.record.employeeId}:${row.record.workDate.toISOString().slice(0, 10)}`, row.record]));
      const assignments = await db.select({ assignment: shiftAssignments, shift: shifts }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(gte(shiftAssignments.workDate, periodStart), lte(shiftAssignments.workDate, periodEnd)));
      const assignmentByEmployeeDate = new Map(assignments.map(row => [`${row.assignment.employeeId}:${row.assignment.workDate.toISOString().slice(0, 10)}`, row]));
      const seen = new Set<string>();
      const prepared = input.rows.map(row => {
        const employeeCode = row.employeeCode.trim().toUpperCase();
        const workDate = startOfDay(row.workDate);
        const key = `${employeeCode}:${workDate.toISOString().slice(0, 10)}`;
        const issues: string[] = [];
        if (seen.has(key)) issues.push("duplicate_row");
        seen.add(key);
        const employee = employeeByCode.get(employeeCode);
        if (!employee) issues.push("employee_not_found");
        if (row.checkInAt && row.checkOutAt && row.checkOutAt <= row.checkInAt) issues.push("invalid_time_order");
        const requestedStatus = row.status ?? "present";
        if ((requestedStatus === "present" && (!row.checkInAt || !row.checkOutAt)) || ((requestedStatus === "absent" || requestedStatus === "excused") && (row.checkInAt || row.checkOutAt))) issues.push("incomplete_attendance_row");
        const existing = employee ? existingByEmployeeDate.get(`${employee.id}:${workDate.toISOString().slice(0, 10)}`) : undefined;
        if (existing && !input.replaceExisting) issues.push("existing_attendance_record");
        const assignment = employee ? assignmentByEmployeeDate.get(`${employee.id}:${workDate.toISOString().slice(0, 10)}`) : undefined;
        const scheduledMinutes = assignment ? scheduledMinutesForShift(workDate, { startTime: String(assignment.shift.startTime), endTime: String(assignment.shift.endTime), breakMinutes: assignment.shift.breakMinutes }) : 0;
        const workedMinutes = row.checkInAt && row.checkOutAt ? Math.max(0, Math.floor((row.checkOutAt.getTime() - row.checkInAt.getTime()) / 60_000) - (assignment?.shift.breakMinutes ?? 0)) : 0;
        const lateMinutes = row.checkInAt && assignment ? lateMinutesFromSchedule(row.checkInAt, workDate, String(assignment.shift.startTime), assignment.shift.graceMinutes) : 0;
        const scheduledEnd = assignment ? timeOnWorkDate(workDate, String(assignment.shift.endTime), String(assignment.shift.endTime) <= String(assignment.shift.startTime)) : null;
        const earlyLeaveMinutes = row.checkOutAt && scheduledEnd ? Math.max(0, Math.floor((scheduledEnd.getTime() - row.checkOutAt.getTime()) / 60_000)) : 0;
        const overtimeMinutes = scheduledMinutes ? Math.max(0, workedMinutes - scheduledMinutes) : 0;
        const status = requestedStatus === "present" ? (lateMinutes > 0 ? "late" as const : "present" as const) : requestedStatus;
        return { employeeCode, employee, workDate, checkInAt: row.checkInAt ?? null, checkOutAt: row.checkOutAt ?? null, workedMinutes, lateMinutes, earlyLeaveMinutes, overtimeMinutes, status, issues, existing, assignment };
      });
      const issueCounts = new Map<string, number>();
      prepared.forEach(row => row.issues.forEach(issue => issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1)));
      const accepted = prepared.filter(row => row.issues.length === 0);
      const batchResult = await db.insert(attendanceImportBatches).values({ branchId: input.branchId, sourceFileName: input.sourceFileName, sourceFormat: input.sourceFormat, periodStart, periodEnd, status: accepted.length ? "applied" : "rejected", totalRows: prepared.length, acceptedRows: accepted.length, rejectedRows: prepared.length - accepted.length, issueSummary: Array.from(issueCounts, ([code, count]) => ({ code, count })), importedByUserId: ctx.user.id, appliedAt: accepted.length ? new Date() : null });
      const batchId = Number(batchResult[0].insertId);
      await db.insert(attendanceImportRows).values(prepared.map(row => ({ batchId, employeeId: row.employee?.id ?? null, employeeCode: row.employeeCode, workDate: row.workDate, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, workedMinutes: row.workedMinutes, lateMinutes: row.lateMinutes, earlyLeaveMinutes: row.earlyLeaveMinutes, overtimeMinutes: row.overtimeMinutes, status: (row.issues.length ? (row.issues.includes("existing_attendance_record") ? "skipped" : "invalid") : "applied") as "applied" | "skipped" | "invalid", issueCodes: row.issues })));
      for (const row of accepted) {
        const values = { employeeId: row.employee!.id, shiftAssignmentId: row.assignment?.assignment.id ?? null, importBatchId: batchId, workDate: row.workDate, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt, workedMinutes: row.workedMinutes, lateMinutes: row.lateMinutes, earlyLeaveMinutes: row.earlyLeaveMinutes, overtimeMinutes: row.overtimeMinutes, status: row.status, source: "import" as const, notes: `مستورد من ${input.sourceFileName}` };
        if (row.existing) await db.update(attendanceRecords).set(values).where(eq(attendanceRecords.id, row.existing.id));
        else await db.insert(attendanceRecords).values(values);
      }
      return { success: true, batchId, applied: accepted.length, skipped: prepared.length - accepted.length, issueSummary: Array.from(issueCounts, ([code, count]) => ({ code, count })) };
    }),
    importHistory: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select().from(attendanceImportBatches).where(eq(attendanceImportBatches.branchId, input.branchId)).orderBy(desc(attendanceImportBatches.createdAt)).limit(30);
    }),
    branchReport: managerProcedure.input(z.object({ branchId: z.number().int().positive(), from: z.coerce.date(), to: z.coerce.date() }).refine(input => input.to >= input.from, { message: "نطاق التاريخ غير صالح." })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const from = startOfDay(input.from); const to = endOfDay(input.to); const today = startOfDay();
      const rows = await db.select({ employee: employees, assignment: shiftAssignments, shift: shifts, attendance: attendanceRecords }).from(shiftAssignments).innerJoin(employees, eq(shiftAssignments.employeeId, employees.id)).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).leftJoin(attendanceRecords, and(eq(attendanceRecords.employeeId, employees.id), eq(attendanceRecords.workDate, shiftAssignments.workDate))).where(and(eq(employees.branchId, input.branchId), gte(shiftAssignments.workDate, from), lte(shiftAssignments.workDate, to))).orderBy(asc(employees.fullName), asc(shiftAssignments.workDate));
      const summaries = new Map<number, { employeeId: number; employeeCode: string; fullName: string; days: Array<{ scheduledMinutes: number; workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; status: "present" | "late" | "absent" | "excused" }>; expectedDays: number }>();
      rows.forEach(row => {
        const entry = summaries.get(row.employee.id) ?? { employeeId: row.employee.id, employeeCode: row.employee.employeeCode, fullName: row.employee.fullName, days: [], expectedDays: 0 };
        const scheduledMinutes = scheduledMinutesForShift(row.assignment.workDate, { startTime: String(row.shift.startTime), endTime: String(row.shift.endTime), breakMinutes: row.shift.breakMinutes });
        if (row.assignment.workDate <= today) { entry.expectedDays += 1; entry.days.push(row.attendance ? { scheduledMinutes, workedMinutes: row.attendance.workedMinutes, lateMinutes: row.attendance.lateMinutes, earlyLeaveMinutes: row.attendance.earlyLeaveMinutes, overtimeMinutes: row.attendance.overtimeMinutes, status: row.attendance.status } : { scheduledMinutes, workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: "absent" }); }
        summaries.set(row.employee.id, entry);
      });
      return Array.from(summaries.values()).map(entry => ({ ...entry, summary: calculateAttendanceCompliance(entry.days) })).sort((a, b) => a.fullName.localeCompare(b.fullName, "ar"));
    }),
    branchComparison: ownerProcedure.input(z.object({ year: z.number().int().min(2024).max(2100), month: z.number().int().min(1).max(12) })).query(async ({ input }) => {
      const db = await requireDb();
      const currentFrom = new Date(input.year, input.month - 1, 1);
      const currentTo = endOfDay(new Date(input.year, input.month, 0));
      const previousFrom = new Date(input.year, input.month - 2, 1);
      const previousTo = endOfDay(new Date(input.year, input.month - 1, 0));
      const [activeBranches, assignments] = await Promise.all([
        db.select({ id: branches.id, name: branches.name, code: branches.code }).from(branches).where(eq(branches.isActive, "yes")).orderBy(asc(branches.name)),
        db.select({ employee: employees, assignment: shiftAssignments, shift: shifts, attendance: attendanceRecords }).from(shiftAssignments).innerJoin(employees, eq(shiftAssignments.employeeId, employees.id)).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).leftJoin(attendanceRecords, and(eq(attendanceRecords.employeeId, employees.id), eq(attendanceRecords.workDate, shiftAssignments.workDate))).where(and(gte(shiftAssignments.workDate, previousFrom), lte(shiftAssignments.workDate, currentTo))),
      ]);
      const today = startOfDay();
      type Day = { scheduledMinutes: number; workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; status: "present" | "late" | "absent" | "excused" };
      const byBranch = new Map<number, { current: Day[]; previous: Day[] }>();
      activeBranches.forEach(branch => byBranch.set(branch.id, { current: [], previous: [] }));
      assignments.forEach(row => {
        if (row.assignment.workDate > today) return;
        const bucket = byBranch.get(row.employee.branchId);
        if (!bucket) return;
        const day: Day = row.attendance ? { scheduledMinutes: scheduledMinutesForShift(row.assignment.workDate, { startTime: String(row.shift.startTime), endTime: String(row.shift.endTime), breakMinutes: row.shift.breakMinutes }), workedMinutes: row.attendance.workedMinutes, lateMinutes: row.attendance.lateMinutes, earlyLeaveMinutes: row.attendance.earlyLeaveMinutes, overtimeMinutes: row.attendance.overtimeMinutes, status: row.attendance.status } : { scheduledMinutes: scheduledMinutesForShift(row.assignment.workDate, { startTime: String(row.shift.startTime), endTime: String(row.shift.endTime), breakMinutes: row.shift.breakMinutes }), workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: "absent" };
        if (row.assignment.workDate >= currentFrom && row.assignment.workDate <= currentTo) bucket.current.push(day);
        else if (row.assignment.workDate >= previousFrom && row.assignment.workDate <= previousTo) bucket.previous.push(day);
      });
      return activeBranches.map(branch => {
        const bucket = byBranch.get(branch.id)!;
        const current = calculateAttendanceCompliance(bucket.current);
        const previous = calculateAttendanceCompliance(bucket.previous);
        const currentAvailable = bucket.current.length > 0;
        const previousAvailable = bucket.previous.length > 0;
        return { branchId: branch.id, branchName: branch.name, branchCode: branch.code, month: input.month, year: input.year, expectedDays: bucket.current.length, complianceScore: currentAvailable ? current.complianceScore : null, attendanceRate: currentAvailable ? current.attendanceRate : null, punctualityRate: currentAvailable ? current.punctualityRate : null, hoursRate: currentAvailable ? current.hoursRate : null, totalLateMinutes: current.totalLateMinutes, previousComplianceScore: previousAvailable ? previous.complianceScore : null, monthlyChange: currentAvailable && previousAvailable ? current.complianceScore - previous.complianceScore : null };
      }).sort((a, b) => (b.complianceScore ?? -1) - (a.complianceScore ?? -1) || a.branchName.localeCompare(b.branchName, "ar"));
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
    operationsSnapshot: managerProcedure.input(z.object({ branchId: z.number().int().positive(), from: z.coerce.date(), to: z.coerce.date() }).refine(input => input.to >= input.from, { message: "نطاق الفترة غير صالح." })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const from = startOfDay(input.from);
      const to = endOfDay(input.to);
      const [definitions, team, recorded] = await Promise.all([
        db.select({ definition: kpiDefinitions, ownerName: employees.fullName }).from(kpiDefinitions).leftJoin(employees, eq(kpiDefinitions.ownerEmployeeId, employees.id)).where(and(eq(kpiDefinitions.branchId, input.branchId), eq(kpiDefinitions.isActive, "yes"))).orderBy(asc(kpiDefinitions.name)),
        db.select({ id: employees.id, fullName: employees.fullName, role: employees.role, employeeCode: employees.employeeCode }).from(employees).where(and(eq(employees.branchId, input.branchId), eq(employees.employmentStatus, "active"))).orderBy(asc(employees.fullName)),
        db.select({ record: kpiRecords, employeeName: employees.fullName, employeeCode: employees.employeeCode }).from(kpiRecords).innerJoin(employees, eq(kpiRecords.employeeId, employees.id)).where(and(eq(employees.branchId, input.branchId), gte(kpiRecords.periodStart, from), lte(kpiRecords.periodEnd, to))).orderBy(desc(kpiRecords.updatedAt)),
      ]);
      const recordsByKey = new Map<number, typeof recorded[number]>();
      for (const item of recorded) if (!recordsByKey.has(item.record.kpiDefinitionId * 1_000_000 + item.record.employeeId)) recordsByKey.set(item.record.kpiDefinitionId * 1_000_000 + item.record.employeeId, item);
      const indicators = definitions.map(({ definition, ownerName }) => {
        const eligible = team.filter(employee => (definition.applicableRoles as string[]).includes(employee.role));
        const records = eligible.flatMap(employee => {
          const item = recordsByKey.get(definition.id * 1_000_000 + employee.id);
          return item ? [{ ...item, employee }] : [];
        });
        const attention = records.filter(item => toNumber(item.record.score) < 80).length;
        const status = eligible.length === 0 ? "not_applicable" as const : records.length === 0 ? "not_started" as const : records.length < eligible.length ? "incomplete" as const : attention > 0 ? "attention" as const : "on_track" as const;
        return { definition, ownerName: ownerName ?? null, eligibleCount: eligible.length, recordedCount: records.length, missingCount: Math.max(eligible.length - records.length, 0), attentionCount: attention, status, records };
      });
      return { period: { from, to }, indicators, totalDefinitions: indicators.length, onTrackCount: indicators.filter(item => item.status === "on_track").length, attentionCount: indicators.filter(item => item.status === "attention" || item.status === "incomplete" || item.status === "not_started").length };
    }),
    createDefinition: managerProcedure.input(z.object({ branchId: z.number().int().positive(), ownerEmployeeId: z.number().int().positive().nullable().optional(), name: z.string().trim().min(2).max(160), category: z.enum(["sales", "operations", "service", "attendance"]), description: z.string().trim().max(1000).optional(), unit: z.enum(["currency", "number", "percentage", "minutes"]), direction: z.enum(["higher_better", "lower_better"]).default("higher_better"), targetValue: z.number().positive(), weight: z.number().positive().max(100).default(1), measurementPeriod: z.enum(["daily", "weekly", "monthly"]).default("monthly"), applicableRoles: z.array(z.enum(staffRoles)).min(1) })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      if (input.ownerEmployeeId) {
        const owner = (await db.select().from(employees).where(eq(employees.id, input.ownerEmployeeId)).limit(1))[0];
        if (!owner || owner.branchId !== input.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "مالك المؤشر يجب أن يكون موظفاً في الفرع نفسه." });
      }
      await db.insert(kpiDefinitions).values({ ...input, ownerEmployeeId: input.ownerEmployeeId ?? null, targetValue: String(input.targetValue), weight: String(input.weight), description: input.description || null, applicableRoles: input.applicableRoles });
      return { success: true };
    }),
    record: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), kpiDefinitionId: z.number().int().positive(), periodStart: z.coerce.date(), periodEnd: z.coerce.date(), actualValue: z.number().min(0), notes: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      const definition = (await db.select().from(kpiDefinitions).where(eq(kpiDefinitions.id, input.kpiDefinitionId)).limit(1))[0];
      if (!employee || !definition || definition.branchId !== employee.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف أو المؤشر غير صالحين." });
      await assertBranchScope(ctx.user, employee.branchId);
      const score = calculateKpiScore(input.actualValue, toNumber(definition.targetValue), definition.direction);
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

  policies: router({
    attendance: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return (await db.select().from(attendancePolicies).where(eq(attendancePolicies.branchId, input.branchId)).limit(1))[0] ?? null;
    }),
    saveAttendance: managerProcedure.input(z.object({ branchId: z.number().int().positive(), graceMinutes: z.number().int().min(0).max(120), lateMultiplier: z.number().min(1).max(5), monthlyLateMinuteCap: z.number().int().min(1).max(2000).nullable().optional(), pointsPerLateOccurrence: z.number().int().min(0).max(20) })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const values = { ...input, lateMultiplier: String(input.lateMultiplier), monthlyLateMinuteCap: input.monthlyLateMinuteCap ?? null, updatedByUserId: ctx.user.id };
      await db.insert(attendancePolicies).values(values).onDuplicateKeyUpdate({ set: values });
      return { success: true };
    }),
  }),

  orders: router({
    portal: router({
      session: publicProcedure.query(async ({ ctx }) => {
        try {
          const account = await requireOrderPortalAccount(ctx);
          return { authenticated: true, account: { branchId: account.branchId, phoneUsername: account.phoneUsername } };
        } catch (error) {
          if (error instanceof TRPCError && error.code === "UNAUTHORIZED") return { authenticated: false, account: null };
          throw error;
        }
      }),
      login: publicProcedure.input(z.object({ phoneUsername: z.string().trim().min(6).max(32), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const account = (await db.select().from(orderPortalAccounts).where(eq(orderPortalAccounts.phoneUsername, input.phoneUsername)).limit(1))[0];
        const genericFailure = () => new TRPCError({ code: "UNAUTHORIZED", message: "بيانات الدخول غير صحيحة أو الحساب غير متاح." });
        if (!account || account.isActive !== "yes") throw genericFailure();
        const now = new Date();
        if (account.lockedUntil && account.lockedUntil > now) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تم إيقاف المحاولة مؤقتاً لحماية الحساب. أعد المحاولة لاحقاً." });
        if (!verifyOrderPortalPassword(input.password, account.passwordHash)) {
          const attempts = account.failedAttempts + 1;
          const lockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * 60_000) : null;
          await db.update(orderPortalAccounts).set({ failedAttempts: lockedUntil ? 0 : attempts, lockedUntil }).where(eq(orderPortalAccounts.id, account.id));
          throw genericFailure();
        }
        await db.update(orderPortalAccounts).set({ failedAttempts: 0, lockedUntil: null, lastSignedInAt: now }).where(eq(orderPortalAccounts.id, account.id));
        await setOrderPortalSession(ctx, account);
        return { success: true, branchId: account.branchId };
      }),
      logout: publicProcedure.mutation(({ ctx }) => {
        clearOrderPortalSession(ctx);
        return { success: true };
      }),
      staff: publicProcedure.query(async ({ ctx }) => {
        const account = await requireOrderPortalAccount(ctx);
        const db = await requireDb();
        return db.select({ id: orderPortalStaff.id, fullName: orderPortalStaff.fullName }).from(orderPortalStaff).where(and(eq(orderPortalStaff.branchId, account.branchId), eq(orderPortalStaff.isActive, "yes"))).orderBy(asc(orderPortalStaff.fullName));
      }),
      zones: publicProcedure.query(async ({ ctx }) => {
        const account = await requireOrderPortalAccount(ctx);
        const db = await requireDb();
        return db.select({ id: deliveryZones.id, name: deliveryZones.name, slaMinutes: deliveryZones.slaMinutes }).from(deliveryZones).where(and(eq(deliveryZones.branchId, account.branchId), eq(deliveryZones.isActive, "yes"))).orderBy(asc(deliveryZones.name));
      }),
      list: publicProcedure.input(z.object({ status: z.enum(deliveryStatusValues).optional(), search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => {
        const account = await requireOrderPortalAccount(ctx);
        const db = await requireDb();
        const rows = await db.select({ order: deliveryOrders, requesterName: orderPortalStaff.fullName }).from(deliveryOrders).leftJoin(orderPortalStaff, eq(deliveryOrders.requestedByOrderStaffId, orderPortalStaff.id)).where(eq(deliveryOrders.branchId, account.branchId)).orderBy(desc(deliveryOrders.createdAt)).limit(150);
        const search = input?.search?.toLocaleLowerCase("ar-EG");
        return rows.filter(row => (!input?.status || row.order.status === input.status) && (!search || [row.order.orderCode, row.order.customerName, row.order.customerPhone, row.order.itemName ?? "", row.order.itemCode ?? "", row.requesterName ?? ""].some(value => value.toLocaleLowerCase("ar-EG").includes(search))));
      }),
      create: publicProcedure.input(z.object({ requestedByOrderStaffId: z.number().int().positive(), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(6).max(32), itemName: z.string().trim().min(2).max(200), itemCode: z.string().trim().max(80).optional(), quantity: z.number().int().min(1).max(999), address: z.string().trim().min(5).max(2000), deliveryZoneId: z.number().int().positive().optional(), notes: z.string().trim().max(1500).optional() })).mutation(async ({ ctx, input }) => {
        const account = await requireOrderPortalAccount(ctx);
        const db = await requireDb();
        const staff = (await db.select().from(orderPortalStaff).where(eq(orderPortalStaff.id, input.requestedByOrderStaffId)).limit(1))[0];
        if (!staff || staff.branchId !== account.branchId || staff.isActive !== "yes") throw new TRPCError({ code: "FORBIDDEN", message: "اختر اسماً نشطاً ومصرحاً به من القائمة." });
        let zone: typeof deliveryZones.$inferSelect | undefined;
        if (input.deliveryZoneId) {
          zone = (await db.select().from(deliveryZones).where(eq(deliveryZones.id, input.deliveryZoneId)).limit(1))[0];
          if (!zone || zone.branchId !== account.branchId || zone.isActive !== "yes") throw new TRPCError({ code: "BAD_REQUEST", message: "منطقة التوصيل غير صالحة." });
        }
        const orderCode = `ORD-${new Date().toISOString().slice(2, 10).replaceAll("-", "")}-${nanoid(5).toUpperCase()}`;
        const inserted = await db.insert(deliveryOrders).values({ branchId: account.branchId, deliveryZoneId: input.deliveryZoneId ?? null, requestedByOrderStaffId: staff.id, createdByOrderAccountId: account.id, orderCode, customerName: input.customerName, customerPhone: input.customerPhone, itemName: input.itemName, itemCode: input.itemCode || null, quantity: input.quantity, address: input.address, slaDueAt: zone ? new Date(Date.now() + zone.slaMinutes * 60_000) : null, notes: input.notes || null, status: "draft" });
        const orderId = Number(inserted[0].insertId);
        await db.insert(deliveryEvents).values({ deliveryOrderId: orderId, action: "created", note: `تم إدخال الطلب بواسطة ${staff.fullName}.` });
        return { success: true, orderId, orderCode };
      }),
    }),
    admin: router({
      account: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
        await assertBranchScope(ctx.user, input.branchId);
        const db = await requireDb();
        const account = (await db.select().from(orderPortalAccounts).where(eq(orderPortalAccounts.branchId, input.branchId)).orderBy(desc(orderPortalAccounts.updatedAt)).limit(1))[0] ?? null;
        return account ? { id: account.id, phoneUsername: account.phoneUsername, isActive: account.isActive, failedAttempts: account.failedAttempts, lockedUntil: account.lockedUntil, lastSignedInAt: account.lastSignedInAt, updatedAt: account.updatedAt } : null;
      }),
      saveAccount: managerProcedure.input(z.object({ branchId: z.number().int().positive(), phoneUsername: z.string().trim().min(6).max(32), password: z.string().min(8).max(128).optional(), isActive: z.enum(["yes", "no"]).default("yes") })).mutation(async ({ ctx, input }) => {
        await assertBranchScope(ctx.user, input.branchId);
        const db = await requireDb();
        const existing = (await db.select().from(orderPortalAccounts).where(eq(orderPortalAccounts.branchId, input.branchId)).orderBy(desc(orderPortalAccounts.updatedAt)).limit(1))[0];
        if (!existing && !input.password) throw new TRPCError({ code: "BAD_REQUEST", message: "أنشئ كلمة مرور لا تقل عن 8 أحرف لحساب الصيدلية." });
        try {
          if (existing) {
            const shouldInvalidate = Boolean(input.password) || existing.isActive !== input.isActive || existing.phoneUsername !== input.phoneUsername;
            await db.update(orderPortalAccounts).set({ phoneUsername: input.phoneUsername, passwordHash: input.password ? hashOrderPortalPassword(input.password) : existing.passwordHash, isActive: input.isActive, sessionVersion: shouldInvalidate ? existing.sessionVersion + 1 : existing.sessionVersion, failedAttempts: 0, lockedUntil: null }).where(eq(orderPortalAccounts.id, existing.id));
            return { success: true, created: false };
          }
          await db.insert(orderPortalAccounts).values({ branchId: input.branchId, phoneUsername: input.phoneUsername, passwordHash: hashOrderPortalPassword(input.password!), isActive: input.isActive, createdByUserId: ctx.user.id });
          return { success: true, created: true };
        } catch {
          throw new TRPCError({ code: "CONFLICT", message: "رقم الهاتف مستخدم لحساب صيدلية آخر أو تعذر حفظ الإعداد." });
        }
      }),
      staff: managerProcedure.input(z.object({ branchId: z.number().int().positive(), includeInactive: z.boolean().optional() })).query(async ({ ctx, input }) => {
        await assertBranchScope(ctx.user, input.branchId);
        const db = await requireDb();
        const rows = await db.select().from(orderPortalStaff).where(eq(orderPortalStaff.branchId, input.branchId)).orderBy(asc(orderPortalStaff.fullName));
        return input.includeInactive ? rows : rows.filter(row => row.isActive === "yes");
      }),
      saveStaff: managerProcedure.input(z.object({ id: z.number().int().positive().optional(), branchId: z.number().int().positive(), fullName: z.string().trim().min(3).max(160), phone: z.string().trim().max(32).optional(), isActive: z.enum(["yes", "no"]).default("yes") })).mutation(async ({ ctx, input }) => {
        await assertBranchScope(ctx.user, input.branchId);
        const db = await requireDb();
        const values = { branchId: input.branchId, fullName: input.fullName, phone: input.phone || null, isActive: input.isActive };
        try {
          if (input.id) {
            const existing = (await db.select().from(orderPortalStaff).where(eq(orderPortalStaff.id, input.id)).limit(1))[0];
            if (!existing || existing.branchId !== input.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك تعديل هذا الاسم." });
            await db.update(orderPortalStaff).set(values).where(eq(orderPortalStaff.id, input.id));
            return { success: true, id: input.id };
          }
          const inserted = await db.insert(orderPortalStaff).values({ ...values, createdByUserId: ctx.user.id });
          return { success: true, id: Number(inserted[0].insertId) };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({ code: "CONFLICT", message: "الاسم مسجل مسبقاً في هذا الفرع." });
        }
      }),
      list: managerProcedure.input(z.object({ branchId: z.number().int().positive(), status: z.enum(deliveryStatusValues).optional(), search: z.string().trim().max(120).optional() })).query(async ({ ctx, input }) => {
        await assertBranchScope(ctx.user, input.branchId);
        const db = await requireDb();
        const rows = await db.select({ order: deliveryOrders, requesterName: orderPortalStaff.fullName, accountPhone: orderPortalAccounts.phoneUsername, zoneName: deliveryZones.name, courierName: employees.fullName }).from(deliveryOrders).leftJoin(orderPortalStaff, eq(deliveryOrders.requestedByOrderStaffId, orderPortalStaff.id)).leftJoin(orderPortalAccounts, eq(deliveryOrders.createdByOrderAccountId, orderPortalAccounts.id)).leftJoin(deliveryZones, eq(deliveryOrders.deliveryZoneId, deliveryZones.id)).leftJoin(employees, eq(deliveryOrders.assignedEmployeeId, employees.id)).where(eq(deliveryOrders.branchId, input.branchId)).orderBy(desc(deliveryOrders.createdAt));
        const search = input.search?.toLocaleLowerCase("ar-EG");
        return rows.filter(row => (!input.status || row.order.status === input.status) && (!search || [row.order.orderCode, row.order.customerName, row.order.customerPhone, row.order.itemName ?? "", row.order.itemCode ?? "", row.requesterName ?? "", row.courierName ?? ""].some(value => value.toLocaleLowerCase("ar-EG").includes(search))));
      }),
      updateStatus: managerProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(orderManagerStatusValues), note: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0];
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "الطلب غير موجود." });
        await assertBranchScope(ctx.user, order.branchId);
        if (input.status === "cancelled" && !input.note) throw new TRPCError({ code: "BAD_REQUEST", message: "أضف سبب الإلغاء لحماية سجل العميل." });
        const now = new Date();
        const update: Partial<typeof deliveryOrders.$inferInsert> = { status: input.status };
        if (input.status === "contacted") update.contactedAt = now;
        if (input.status === "prepared" || input.status === "ready") update.preparedAt = now;
        if (input.status === "cancelled") update.cancelledAt = now;
        await db.update(deliveryOrders).set(update).where(eq(deliveryOrders.id, order.id));
        await db.insert(deliveryEvents).values({ deliveryOrderId: order.id, action: input.status === "cancelled" ? "cancelled" : "note", note: `${{ draft: "تمت مراجعة الطلب", contacted: "تم التواصل مع العميل", prepared: "الطلب قيد التجهيز", ready: "الطلب جاهز للتوصيل", cancelled: "تم إلغاء الطلب" }[input.status]}${input.note ? `: ${input.note}` : ""}` });
        return { success: true };
      }),
    }),
  }),

  delivery: router({
    list: managerProcedure.input(z.object({ branchId: z.number().int().positive(), status: z.enum(deliveryStatusValues).optional() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const rows = await db.select({ order: deliveryOrders, agentName: employees.fullName }).from(deliveryOrders).leftJoin(employees, eq(deliveryOrders.assignedEmployeeId, employees.id)).where(eq(deliveryOrders.branchId, input.branchId)).orderBy(desc(deliveryOrders.createdAt));
      return input.status ? rows.filter(row => row.order.status === input.status) : rows;
    }),
    mine: protectedProcedure.query(async ({ ctx }) => {
      const employee = await requireEmployeeProfile(ctx.user.id); const db = await requireDb();
      return db.select().from(deliveryOrders).where(eq(deliveryOrders.assignedEmployeeId, employee.id)).orderBy(desc(deliveryOrders.createdAt));
    }),
    create: managerProcedure.input(z.object({ branchId: z.number().int().positive(), deliveryZoneId: z.number().int().positive().optional(), orderCode: z.string().trim().min(2).max(48), customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(6).max(32), address: z.string().trim().min(5).max(2000), promisedAt: z.coerce.date().optional(), notes: z.string().trim().max(2000).optional() })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); let zone: typeof deliveryZones.$inferSelect | undefined;
      if (input.deliveryZoneId) { zone = (await db.select().from(deliveryZones).where(eq(deliveryZones.id, input.deliveryZoneId)).limit(1))[0]; if (!zone || zone.branchId !== input.branchId || zone.isActive !== "yes") throw new TRPCError({ code: "BAD_REQUEST", message: "منطقة التوصيل غير صالحة أو مؤرشفة." }); }
      const slaDueAt = input.promisedAt ?? (zone ? new Date(Date.now() + zone.slaMinutes * 60_000) : null);
      const inserted = await db.insert(deliveryOrders).values({ ...input, deliveryZoneId: input.deliveryZoneId ?? null, promisedAt: input.promisedAt ?? null, slaDueAt, notes: input.notes || null, status: "ready", createdByUserId: ctx.user.id });
      const id = Number(inserted[0].insertId);
      await db.insert(deliveryEvents).values({ deliveryOrderId: id, action: "created", note: "تم إنشاء طلب التوصيل." });
      return { success: true, orderId: id };
    }),
    assign: managerProcedure.input(z.object({ orderId: z.number().int().positive(), employeeId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb(); const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0]; const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!order || !employee || employee.branchId !== order.branchId) throw new TRPCError({ code: "BAD_REQUEST", message: "الطلب أو المندوب غير صالحين." });
      await assertBranchScope(ctx.user, order.branchId);
      await db.update(deliveryOrders).set({ assignedEmployeeId: employee.id, status: "assigned" }).where(eq(deliveryOrders.id, order.id));
      await db.insert(deliveryEvents).values({ deliveryOrderId: order.id, actorEmployeeId: employee.id, action: "assigned", note: "تم تعيين المندوب." });
      return { success: true };
    }),
    updateStatus: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), status: z.enum(["picked_up", "en_route", "delivered", "failed", "returned"]), note: z.string().trim().max(1000).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), accuracyMeters: z.number().int().min(0).max(10000).optional() })).mutation(async ({ ctx, input }) => {
      const employee = await requireEmployeeProfile(ctx.user.id); const db = await requireDb(); const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0];
      if (!order || order.assignedEmployeeId !== employee.id) throw new TRPCError({ code: "FORBIDDEN", message: "هذا الطلب غير مسند إليك." });
      if ((input.status === "delivered" || input.status === "failed" || input.status === "returned") && !input.note) throw new TRPCError({ code: "BAD_REQUEST", message: "أدخل ملاحظة أو إثباتاً لإغلاق الطلب." });
      const now = new Date(); const update: Record<string, unknown> = { status: input.status };
      if (input.status === "picked_up") update.pickedUpAt = now;
      if (input.status === "delivered") { update.deliveredAt = now; update.proofNote = input.note; }
      if (input.status === "failed" || input.status === "returned") update.exceptionReason = input.note;
      await db.update(deliveryOrders).set(update).where(eq(deliveryOrders.id, order.id));
      await db.insert(deliveryEvents).values({ deliveryOrderId: order.id, actorEmployeeId: employee.id, action: input.status, note: input.note || null, latitude: input.latitude ? String(input.latitude) : null, longitude: input.longitude ? String(input.longitude) : null, accuracyMeters: input.accuracyMeters ?? null });
      return { success: true };
    }),
    pingLocation: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyMeters: z.number().int().min(0).max(10000).optional() })).mutation(async ({ ctx, input }) => {
      const employee = await requireEmployeeProfile(ctx.user.id); const db = await requireDb(); const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0];
      if (!order || order.assignedEmployeeId !== employee.id || order.status !== "en_route") throw new TRPCError({ code: "FORBIDDEN", message: "يُسمح بتحديث الموقع أثناء رحلة نشطة مسندة إليك فقط." });
      await db.insert(deliveryLocationPings).values({ deliveryOrderId: order.id, employeeId: employee.id, latitude: String(input.latitude), longitude: String(input.longitude), accuracyMeters: input.accuracyMeters ?? null }); return { success: true };
    }),
    liveRoutes: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb();
      const rows = await db.select({ orderId: deliveryOrders.id, orderCode: deliveryOrders.orderCode, customerName: deliveryOrders.customerName, promisedAt: deliveryOrders.promisedAt, agentName: employees.fullName, latitude: deliveryLocationPings.latitude, longitude: deliveryLocationPings.longitude, accuracyMeters: deliveryLocationPings.accuracyMeters, capturedAt: deliveryLocationPings.capturedAt }).from(deliveryLocationPings).innerJoin(deliveryOrders, eq(deliveryLocationPings.deliveryOrderId, deliveryOrders.id)).leftJoin(employees, eq(deliveryLocationPings.employeeId, employees.id)).where(and(eq(deliveryOrders.branchId, input.branchId), eq(deliveryOrders.status, "en_route"))).orderBy(desc(deliveryLocationPings.capturedAt)).limit(250);
      const routes: { orderId: number; orderCode: string; customerName: string; agentName: string | null; promisedAt: Date | null; points: { latitude: string; longitude: string; accuracyMeters: number | null; capturedAt: Date }[] }[] = [];
      for (const row of rows) { let route = routes.find(item => item.orderId === row.orderId); if (!route) { route = { orderId: row.orderId, orderCode: row.orderCode, customerName: row.customerName, agentName: row.agentName, promisedAt: row.promisedAt, points: [] }; routes.push(route); } if (route.points.length < 50) route.points.unshift({ latitude: row.latitude, longitude: row.longitude, accuracyMeters: row.accuracyMeters, capturedAt: row.capturedAt }); }
      return routes;
    }),
    zones: managerProcedure.input(z.object({ branchId: z.number().int().positive(), activeOnly: z.boolean().optional() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); const rows = await db.select().from(deliveryZones).where(eq(deliveryZones.branchId, input.branchId)).orderBy(asc(deliveryZones.name)); return input.activeOnly ? rows.filter(row => row.isActive === "yes") : rows;
    }),
    saveZone: managerProcedure.input(z.object({ id: z.number().int().positive().optional(), branchId: z.number().int().positive(), name: z.string().trim().min(2).max(160), code: z.string().trim().max(32).optional(), description: z.string().trim().max(2000).optional(), slaMinutes: z.number().int().min(5).max(1440), slaWarningMinutes: z.number().int().min(1).max(720).default(10), isActive: z.enum(["yes", "no"]).default("yes") }).refine(input => input.slaWarningMinutes < input.slaMinutes, { message: "يجب أن تكون نافذة التحذير أقل من SLA المنطقة." })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); const values = { branchId: input.branchId, name: input.name, code: input.code || null, description: input.description || null, slaMinutes: input.slaMinutes, slaWarningMinutes: input.slaWarningMinutes, isActive: input.isActive };
      if (input.id) { const current = (await db.select().from(deliveryZones).where(eq(deliveryZones.id, input.id)).limit(1))[0]; if (!current || current.branchId !== input.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذه المنطقة." }); await db.update(deliveryZones).set(values).where(eq(deliveryZones.id, input.id)); return { success: true, id: input.id }; }
      const result = await db.insert(deliveryZones).values(values); return { success: true, id: Number(result[0].insertId) };
    }),
    slaAlerts: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); const now = new Date(); const rows = await db.select({ order: deliveryOrders, agentName: employees.fullName, zoneName: deliveryZones.name, zoneWarningMinutes: deliveryZones.slaWarningMinutes }).from(deliveryOrders).leftJoin(employees, eq(deliveryOrders.assignedEmployeeId, employees.id)).leftJoin(deliveryZones, eq(deliveryOrders.deliveryZoneId, deliveryZones.id)).where(eq(deliveryOrders.branchId, input.branchId));
      return rows.filter(row => ["assigned", "picked_up", "en_route"].includes(row.order.status) && row.order.slaDueAt).map(row => { const warningAt = new Date(now.getTime() + (row.zoneWarningMinutes ?? 10) * 60_000); return { ...row, state: row.order.slaDueAt! <= now ? "breached" as const : row.order.slaDueAt! <= warningAt ? "at_risk" as const : "on_track" as const, minutesRemaining: Math.ceil((row.order.slaDueAt!.getTime() - now.getTime()) / 60_000), warningMinutes: row.zoneWarningMinutes ?? 10 }; }).filter(row => row.state !== "on_track");
    }),
    weeklyReport: managerProcedure.input(z.object({ branchId: z.number().int().positive(), weekStart: z.coerce.date().optional() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); const today = input.weekStart ? new Date(input.weekStart) : new Date(); const day = today.getDay() || 7; const start = new Date(today); start.setDate(today.getDate() - day + 1); start.setHours(0, 0, 0, 0); const end = new Date(start); end.setDate(start.getDate() + 7);
      const orders = await db.select({ order: deliveryOrders, employeeName: employees.fullName }).from(deliveryOrders).leftJoin(employees, eq(deliveryOrders.assignedEmployeeId, employees.id)).where(and(eq(deliveryOrders.branchId, input.branchId), gte(deliveryOrders.createdAt, start), lte(deliveryOrders.createdAt, end)));
      const proofs = await db.select({ orderId: deliveryProofImages.deliveryOrderId }).from(deliveryProofImages).innerJoin(deliveryOrders, eq(deliveryProofImages.deliveryOrderId, deliveryOrders.id)).where(and(eq(deliveryOrders.branchId, input.branchId), gte(deliveryOrders.createdAt, start), lte(deliveryOrders.createdAt, end)));
      const proofOrders = new Set(proofs.map(item => item.orderId)); const byCourier = new Map<number, { employeeId: number; employeeName: string; assigned: number; delivered: number; late: number; failed: number; proofCount: number; durationMinutes: number; durationSamples: number }>();
      orders.forEach(({ order, employeeName }) => { if (!order.assignedEmployeeId) return; const item = byCourier.get(order.assignedEmployeeId) ?? { employeeId: order.assignedEmployeeId, employeeName: employeeName ?? "مندوب", assigned: 0, delivered: 0, late: 0, failed: 0, proofCount: 0, durationMinutes: 0, durationSamples: 0 }; item.assigned++; if (order.status === "delivered") { item.delivered++; if (order.slaDueAt && order.deliveredAt && order.deliveredAt > order.slaDueAt) item.late++; if (proofOrders.has(order.id)) item.proofCount++; if (order.pickedUpAt && order.deliveredAt) { item.durationMinutes += Math.max(0, Math.round((order.deliveredAt.getTime() - order.pickedUpAt.getTime()) / 60_000)); item.durationSamples++; } } if (["failed", "returned"].includes(order.status)) item.failed++; byCourier.set(item.employeeId, item); });
      return { weekStart: start, weekEnd: end, couriers: Array.from(byCourier.values()).map(item => ({ ...item, completionRate: item.assigned ? Math.round((item.delivered / item.assigned) * 100) : 0, onTimeRate: item.delivered ? Math.round(((item.delivered - item.late) / item.delivered) * 100) : 0, proofRate: item.delivered ? Math.round((item.proofCount / item.delivered) * 100) : 0, averageDeliveryMinutes: item.durationSamples ? Math.round(item.durationMinutes / item.durationSamples) : null, efficiencyScore: item.assigned ? Math.round(((item.delivered / item.assigned) * 45) + (item.delivered ? ((item.delivered - item.late) / item.delivered) * 40 : 0) + (item.delivered ? (item.proofCount / item.delivered) * 15 : 0)) : 0 })).sort((a, b) => b.efficiencyScore - a.efficiencyScore) };
    }),
    uploadProof: protectedProcedure.input(z.object({ orderId: z.number().int().positive(), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(20).max(7_000_000), caption: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => {
      const isManager = hasRole(ctx.user.role, managerRoles); const employee = isManager ? null : await requireEmployeeProfile(ctx.user.id); const db = await requireDb(); const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0]; if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "طلب التوصيل غير موجود." });
      if (isManager) await assertBranchScope(ctx.user, order.branchId); else if (order.assignedEmployeeId !== employee!.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية إثبات هذا الطلب." });
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.dataBase64)) throw new TRPCError({ code: "BAD_REQUEST", message: "بيانات الصورة غير صالحة." }); const bytes = Buffer.from(input.dataBase64, "base64"); if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "يجب ألا تتجاوز صورة الإثبات 5 ميجابايت." }); const extension = input.mimeType === "image/jpeg" ? "jpg" : input.mimeType.split("/")[1]; const stored = await storagePut(`delivery-proofs/${order.branchId}/${order.id}/${Date.now()}.${extension}`, bytes, input.mimeType);
      const result = await db.insert(deliveryProofImages).values({ deliveryOrderId: order.id, storageKey: stored.key, mimeType: input.mimeType, caption: input.caption || null, uploadedByEmployeeId: employee?.id ?? null }); return { success: true, id: Number(result[0].insertId) };
    }),
    proofs: protectedProcedure.input(z.object({ orderId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const isManager = hasRole(ctx.user.role, managerRoles); const employee = isManager ? null : await requireEmployeeProfile(ctx.user.id); const db = await requireDb(); const order = (await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, input.orderId)).limit(1))[0]; if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "طلب التوصيل غير موجود." }); if (isManager) await assertBranchScope(ctx.user, order.branchId); else if (order.assignedEmployeeId !== employee!.id) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية عرض إثبات هذا الطلب." }); const rows = await db.select().from(deliveryProofImages).where(eq(deliveryProofImages.deliveryOrderId, order.id)).orderBy(desc(deliveryProofImages.createdAt)); return Promise.all(rows.map(async row => ({ ...row, url: (await storageGet(row.storageKey)).url })));
    }),
    summary: managerProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => { await assertBranchScope(ctx.user, input.branchId); const db = await requireDb(); const rows = await db.select().from(deliveryOrders).where(eq(deliveryOrders.branchId, input.branchId)); const today = startOfDay(); const trips = rows.filter(row => row.createdAt >= today); const delivered = trips.filter(row => row.status === "delivered"); const late = delivered.filter(row => row.slaDueAt && row.deliveredAt && row.deliveredAt > row.slaDueAt); return { dailyTrips: trips.length, delivered: delivered.length, delayed: late.length, active: rows.filter(row => row.status === "assigned" || row.status === "picked_up" || row.status === "en_route").length }; }),
  }),

  chat: router({
    faq: publicProcedure.query(async () => { const db = await requireDb(); return db.select().from(faqEntries).where(eq(faqEntries.isActive, "yes")).orderBy(asc(faqEntries.sortOrder)); }),
    start: publicProcedure.input(z.object({ customerName: z.string().trim().min(2).max(160), customerPhone: z.string().trim().min(6).max(32), subject: z.string().trim().max(220).optional(), body: z.string().trim().min(2).max(2000) })).mutation(async ({ input }) => { const db = await requireDb(); const token = nanoid(32); const inserted = await db.insert(chatConversations).values({ publicToken: token, customerName: input.customerName, customerPhone: input.customerPhone, subject: input.subject || null }); const conversationId = Number(inserted[0].insertId); await db.insert(chatMessages).values({ conversationId, sender: "customer", body: input.body }); return { token }; }),
    mine: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => { const db = await requireDb(); const conversation = (await db.select().from(chatConversations).where(eq(chatConversations.publicToken, input.token)).limit(1))[0]; if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "لم يتم العثور على المحادثة." }); const messages = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversation.id)).orderBy(asc(chatMessages.createdAt)); return { conversation, messages }; }),
    send: publicProcedure.input(z.object({ token: z.string().min(20).max(64), body: z.string().trim().min(1).max(2000) })).mutation(async ({ input }) => { const db = await requireDb(); const conversation = (await db.select().from(chatConversations).where(eq(chatConversations.publicToken, input.token)).limit(1))[0]; if (!conversation || conversation.status === "closed") throw new TRPCError({ code: "FORBIDDEN", message: "هذه المحادثة مغلقة." }); await db.insert(chatMessages).values({ conversationId: conversation.id, sender: "customer", body: input.body }); await db.update(chatConversations).set({ status: "open", lastMessageAt: new Date() }).where(eq(chatConversations.id, conversation.id)); return { success: true }; }),
    inbox: managerProcedure.query(async () => { const db = await requireDb(); return db.select().from(chatConversations).orderBy(desc(chatConversations.lastMessageAt)); }),
    reply: managerProcedure.input(z.object({ conversationId: z.number().int().positive(), body: z.string().trim().min(1).max(2000), status: z.enum(["open", "pending", "closed"]).optional() })).mutation(async ({ ctx, input }) => { const db = await requireDb(); const conversation = (await db.select().from(chatConversations).where(eq(chatConversations.id, input.conversationId)).limit(1))[0]; if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "المحادثة غير موجودة." }); await db.insert(chatMessages).values({ conversationId: conversation.id, sender: "agent", body: input.body, authorUserId: ctx.user.id }); await db.update(chatConversations).set({ assignedUserId: ctx.user.id, status: input.status ?? "pending", lastMessageAt: new Date() }).where(eq(chatConversations.id, conversation.id)); return { success: true }; }),
    quickReplies: managerProcedure.query(async () => { const db = await requireDb(); return db.select().from(quickReplies).orderBy(desc(quickReplies.updatedAt)); }),
    saveQuickReply: managerProcedure.input(z.object({ id: z.number().int().positive().optional(), title: z.string().trim().min(2).max(160), body: z.string().trim().min(2).max(2000), isActive: z.enum(["yes", "no"]).default("yes") })).mutation(async ({ ctx, input }) => { const db = await requireDb(); const profile = await requireEmployeeProfile(ctx.user.id); if (input.id) { const current = (await db.select().from(quickReplies).where(eq(quickReplies.id, input.id)).limit(1))[0]; if (!current || (current.branchId && current.branchId !== profile.branchId && !hasRole(ctx.user.role, ownerRoles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذا الرد." }); await db.update(quickReplies).set({ title: input.title, body: input.body, isActive: input.isActive }).where(eq(quickReplies.id, input.id)); } else await db.insert(quickReplies).values({ branchId: profile.branchId, title: input.title, body: input.body, isActive: input.isActive }); return { success: true }; }),
    faqAdmin: managerProcedure.query(async ({ ctx }) => { const db = await requireDb(); const profile = await requireEmployeeProfile(ctx.user.id); const rows = await db.select().from(faqEntries).orderBy(asc(faqEntries.sortOrder)); return hasRole(ctx.user.role, ownerRoles) ? rows : rows.filter(row => row.branchId === profile.branchId); }),
    saveFaq: managerProcedure.input(z.object({ id: z.number().int().positive().optional(), question: z.string().trim().min(4).max(300), answer: z.string().trim().min(4).max(4000), sortOrder: z.number().int().min(0).max(999).default(0), isActive: z.enum(["yes", "no"]).default("yes") })).mutation(async ({ ctx, input }) => { const db = await requireDb(); const profile = await requireEmployeeProfile(ctx.user.id); if (input.id) { const current = (await db.select().from(faqEntries).where(eq(faqEntries.id, input.id)).limit(1))[0]; if (!current || (current.branchId && current.branchId !== profile.branchId && !hasRole(ctx.user.role, ownerRoles))) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذا السؤال." }); await db.update(faqEntries).set({ question: input.question, answer: input.answer, sortOrder: input.sortOrder, isActive: input.isActive }).where(eq(faqEntries.id, input.id)); } else await db.insert(faqEntries).values({ branchId: profile.branchId, question: input.question, answer: input.answer, sortOrder: input.sortOrder, isActive: input.isActive }); return { success: true }; }),
    whatsappLink: managerProcedure.input(z.object({ phone: z.string().trim().min(6).max(32), body: z.string().trim().min(2).max(2000), conversationId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => { const db = await requireDb(); const profile = await requireEmployeeProfile(ctx.user.id); const normalized = input.phone.replace(/\D/g, ""); if (normalized.length < 8) throw new TRPCError({ code: "BAD_REQUEST", message: "رقم WhatsApp غير صالح." }); await db.insert(customerContactLogs).values({ branchId: profile.branchId, conversationId: input.conversationId ?? null, customerPhone: input.phone, channel: "whatsapp_link", body: input.body, actorUserId: ctx.user.id }); return { url: `https://wa.me/${normalized}?text=${encodeURIComponent(input.body)}` }; }),
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
    listRules: payrollProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select().from(attendanceRules).where(eq(attendanceRules.branchId, input.branchId)).orderBy(desc(attendanceRules.isActive), asc(attendanceRules.name));
    }),
    simulationCatalog: payrollProcedure.input(z.object({ branchId: z.number().int().positive(), asOf: z.coerce.date() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const asOf = endOfDay(input.asOf);
      const rows = await db.select({ employeeId: employees.id, fullName: employees.fullName, employeeCode: employees.employeeCode, jobTitle: employees.jobTitle, salaryStructureId: salaryStructures.id, salaryEffectiveFrom: salaryStructures.effectiveFrom }).from(employees).leftJoin(salaryStructures, and(eq(salaryStructures.employeeId, employees.id), lte(salaryStructures.effectiveFrom, asOf), or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, asOf)))).where(and(eq(employees.branchId, input.branchId), eq(employees.employmentStatus, "active"))).orderBy(asc(employees.fullName), desc(salaryStructures.effectiveFrom));
      const catalog = new Map<number, { employeeId: number; fullName: string; employeeCode: string; jobTitle: string; hasActiveSalary: boolean; salaryEffectiveFrom: Date | null }>();
      for (const row of rows) {
        if (!catalog.has(row.employeeId)) catalog.set(row.employeeId, { employeeId: row.employeeId, fullName: row.fullName, employeeCode: row.employeeCode, jobTitle: row.jobTitle, hasActiveSalary: Boolean(row.salaryStructureId), salaryEffectiveFrom: row.salaryEffectiveFrom ?? null });
      }
      return Array.from(catalog.values());
    }),
    simulationInputs: payrollProcedure.input(z.object({ employeeId: z.number().int().positive(), from: z.coerce.date(), to: z.coerce.date() }).refine(input => input.to >= input.from, { message: "نطاق التاريخ غير صالح." })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود." });
      await assertBranchScope(ctx.user, employee.branchId);
      const from = startOfDay(input.from);
      const to = endOfDay(input.to);
      const [salary, approvedAdjustments] = await Promise.all([
        db.select().from(salaryStructures).where(and(eq(salaryStructures.employeeId, employee.id), lte(salaryStructures.effectiveFrom, to), or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, from)))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1),
        db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.employeeId, employee.id), eq(payrollAdjustments.status, "approved"), gte(payrollAdjustments.occurrenceDate, from), lte(payrollAdjustments.occurrenceDate, to))).orderBy(desc(payrollAdjustments.occurrenceDate)),
      ]);
      return { salary: salary[0] ?? null, approvedAdjustments: approvedAdjustments.filter(adjustment => !adjustment.payrollRunId) };
    }),
    saveRule: ownerProcedure.input(z.object({
      id: z.number().int().positive().optional(), branchId: z.number().int().positive(), name: z.string().trim().min(3).max(160),
      metric: z.enum(["late_minutes", "late_occurrences", "absence_days", "early_leave_minutes", "overtime_minutes"]), threshold: z.number().int().min(0).max(100000), direction: z.enum(["at_least", "at_most"]), adjustmentType: z.enum(["reward", "penalty"]), amountMode: z.enum(["fixed", "per_unit", "daily_rate_percentage"]), amount: z.number().positive().max(1000000), maximumAmount: z.number().min(0).max(1000000).nullable().optional(), requiresApproval: z.enum(["yes", "no"]).default("yes"), isActive: z.enum(["yes", "no"]).default("yes"), effectiveFrom: z.coerce.date(), effectiveTo: z.coerce.date().nullable().optional(),
    }).refine(input => !input.effectiveTo || input.effectiveTo >= input.effectiveFrom, { message: "تاريخ انتهاء القاعدة يجب أن يكون بعد تاريخ بدئها." })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const values = { branchId: input.branchId, name: input.name, metric: input.metric, threshold: input.threshold, direction: input.direction, adjustmentType: input.adjustmentType, amountMode: input.amountMode, amount: String(input.amount), maximumAmount: input.maximumAmount === null || input.maximumAmount === undefined ? null : String(input.maximumAmount), requiresApproval: input.requiresApproval, isActive: input.isActive, effectiveFrom: startOfDay(input.effectiveFrom), effectiveTo: input.effectiveTo ? startOfDay(input.effectiveTo) : null, createdByUserId: ctx.user.id };
      if (input.id) {
        const current = (await db.select().from(attendanceRules).where(eq(attendanceRules.id, input.id)).limit(1))[0];
        if (!current || current.branchId !== input.branchId) throw new TRPCError({ code: "FORBIDDEN", message: "لا تملك صلاحية تعديل هذه القاعدة." });
        await db.update(attendanceRules).set(values).where(eq(attendanceRules.id, input.id));
        return { success: true, id: input.id };
      }
      const created = await db.insert(attendanceRules).values(values);
      return { success: true, id: Number(created[0].insertId) };
    }),
    requestAdjustment: managerProcedure.input(z.object({ employeeId: z.number().int().positive(), adjustmentType: z.enum(["reward", "penalty"]), amount: z.number().positive().max(1000000), occurrenceDate: z.coerce.date(), description: z.string().trim().min(3).max(2000) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const employee = (await db.select().from(employees).where(eq(employees.id, input.employeeId)).limit(1))[0];
      if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود." });
      await assertBranchScope(ctx.user, employee.branchId);
      const result = await db.insert(payrollAdjustments).values({ branchId: employee.branchId, employeeId: employee.id, adjustmentType: input.adjustmentType, source: "manual", status: "pending", amount: String(input.amount), occurrenceDate: startOfDay(input.occurrenceDate), description: input.description, requestedByUserId: ctx.user.id });
      return { success: true, id: Number(result[0].insertId) };
    }),
    adjustments: payrollProcedure.input(z.object({ branchId: z.number().int().positive(), status: z.enum(["pending", "approved", "rejected", "applied"]).optional() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const rows = await db.select({ adjustment: payrollAdjustments, employeeName: employees.fullName, employeeCode: employees.employeeCode, ruleName: attendanceRules.name }).from(payrollAdjustments).innerJoin(employees, eq(payrollAdjustments.employeeId, employees.id)).leftJoin(attendanceRules, eq(payrollAdjustments.attendanceRuleId, attendanceRules.id)).where(eq(payrollAdjustments.branchId, input.branchId)).orderBy(desc(payrollAdjustments.createdAt));
      return input.status ? rows.filter(row => row.adjustment.status === input.status) : rows;
    }),
    reviewAdjustment: financialApproverProcedure.input(z.object({ adjustmentId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const adjustment = (await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, input.adjustmentId)).limit(1))[0];
      if (!adjustment) throw new TRPCError({ code: "NOT_FOUND", message: "التعديل المالي غير موجود." });
      await assertBranchScope(ctx.user, adjustment.branchId);
      if (adjustment.status !== "pending") throw new TRPCError({ code: "CONFLICT", message: "تمت مراجعة هذا التعديل المالي سابقاً." });
      await db.update(payrollAdjustments).set({ status: input.decision, reviewedByUserId: ctx.user.id, reviewedAt: new Date() }).where(eq(payrollAdjustments.id, adjustment.id));
      return { success: true, status: input.decision };
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
      const policy = (await db.select().from(attendancePolicies).where(eq(attendancePolicies.branchId, input.branchId)).limit(1))[0];
      const activeRules = (await db.select().from(attendanceRules).where(and(eq(attendanceRules.branchId, input.branchId), eq(attendanceRules.isActive, "yes")))).filter(rule => rule.effectiveFrom <= to && (!rule.effectiveTo || rule.effectiveTo >= from));
      const approvedManualAdjustments = (await db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.branchId, input.branchId), eq(payrollAdjustments.status, "approved")))).filter(adjustment => adjustment.source === "manual" && !adjustment.payrollRunId && adjustment.occurrenceDate && adjustment.occurrenceDate >= from && adjustment.occurrenceDate <= to);
      let createdItems = 0;
      let createdAdjustments = 0;
      for (const employee of team) {
        const salary = (await db.select().from(salaryStructures).where(and(eq(salaryStructures.employeeId, employee.id), lte(salaryStructures.effectiveFrom, to))).orderBy(desc(salaryStructures.effectiveFrom)).limit(1))[0];
        if (!salary) continue;
        const [attendance, performance, assignments] = await Promise.all([
          db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employee.id), gte(attendanceRecords.workDate, from), lte(attendanceRecords.workDate, to))),
          db.select().from(kpiRecords).where(and(eq(kpiRecords.employeeId, employee.id), gte(kpiRecords.periodStart, from), lte(kpiRecords.periodEnd, to))),
          db.select({ assignment: shiftAssignments, shift: shifts }).from(shiftAssignments).innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id)).where(and(eq(shiftAssignments.employeeId, employee.id), gte(shiftAssignments.workDate, from), lte(shiftAssignments.workDate, to))),
        ]);
        const attendanceByDate = new Map(attendance.map(record => [record.workDate.toISOString().slice(0, 10), record]));
        const attendanceDays = assignments.map(({ assignment, shift }) => {
          const record = attendanceByDate.get(assignment.workDate.toISOString().slice(0, 10));
          return record ? { scheduledMinutes: scheduledMinutesForShift(assignment.workDate, { startTime: String(shift.startTime), endTime: String(shift.endTime), breakMinutes: shift.breakMinutes }), workedMinutes: record.workedMinutes, lateMinutes: record.lateMinutes, earlyLeaveMinutes: record.earlyLeaveMinutes, overtimeMinutes: record.overtimeMinutes, status: record.status } : { scheduledMinutes: scheduledMinutesForShift(assignment.workDate, { startTime: String(shift.startTime), endTime: String(shift.endTime), breakMinutes: shift.breakMinutes }), workedMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, status: "absent" as const };
        });
        const attendanceSummary = calculateAttendanceCompliance(attendanceDays);
        const absentDays = attendanceSummary.absentDays;
        const rawLateMinutes = attendanceSummary.totalLateMinutes;
        const multipliedLateMinutes = policy?.isActive === "yes" ? Math.ceil(rawLateMinutes * toNumber(policy.lateMultiplier)) : rawLateMinutes;
        const lateMinutes = policy?.monthlyLateMinuteCap ? Math.min(multipliedLateMinutes, policy.monthlyLateMinuteCap) : multipliedLateMinutes;
        const kpiScore = performance.length === 0 ? 0 : performance.reduce((total, record) => total + toNumber(record.score), 0) / performance.length;
        const dailyRate = toNumber(salary.basicSalary) / input.workingDaysInMonth;
        const appliedAdjustmentIds: number[] = [];
        let rewardsTotal = 0;
        let penaltiesTotal = 0;
        approvedManualAdjustments.filter(adjustment => adjustment.employeeId === employee.id).forEach(adjustment => {
          appliedAdjustmentIds.push(adjustment.id);
          if (adjustment.adjustmentType === "reward") rewardsTotal += toNumber(adjustment.amount); else penaltiesTotal += toNumber(adjustment.amount);
        });
        for (const rule of activeRules) {
          const metricValue = attendanceRuleMetricValue(rule.metric, attendanceSummary, attendanceDays.filter(day => day.status === "late").length);
          const adjustment = calculateRuleAdjustment({ metricValue, threshold: rule.threshold, direction: rule.direction, amountMode: rule.amountMode, amount: toNumber(rule.amount), dailyRate, maximumAmount: rule.maximumAmount === null ? null : toNumber(rule.maximumAmount) });
          if (!adjustment.amount) continue;
          const adjustmentStatus = rule.requiresApproval === "yes" ? "pending" as const : "approved" as const;
          const created = await db.insert(payrollAdjustments).values({ payrollRunId: run.id, branchId: input.branchId, employeeId: employee.id, attendanceRuleId: rule.id, adjustmentType: rule.adjustmentType, source: "automatic_rule", status: adjustmentStatus, amount: String(adjustment.amount), metricValue, occurrenceDate: to, description: `قاعدة ${rule.name}: قيمة المؤشر ${metricValue}`, requestedByUserId: ctx.user.id, reviewedByUserId: rule.requiresApproval === "yes" ? null : ctx.user.id, reviewedAt: rule.requiresApproval === "yes" ? null : new Date() });
          createdAdjustments += 1;
          if (adjustmentStatus === "approved") { appliedAdjustmentIds.push(Number(created[0].insertId)); if (rule.adjustmentType === "reward") rewardsTotal += adjustment.amount; else penaltiesTotal += adjustment.amount; }
        }
        const calculation = calculatePayroll({ basicSalary: toNumber(salary.basicSalary), allowances: toNumber(salary.housingAllowance) + toNumber(salary.transportationAllowance) + toNumber(salary.otherAllowances), workingDaysInMonth: input.workingDaysInMonth, absentDays, lateMinutes, lateDeductionPerMinute: toNumber(salary.lateDeductionPerMinute), leaveDeduction: 0, kpiScore, maximumKpiBonus: toNumber(salary.maximumKpiBonus), rewardsTotal, penaltiesTotal });
        await db.insert(payrollItems).values({ payrollRunId: run.id, employeeId: employee.id, basicSalary: String(salary.basicSalary), totalAllowances: String(toNumber(salary.housingAllowance) + toNumber(salary.transportationAllowance) + toNumber(salary.otherAllowances)), kpiScore: String(kpiScore), kpiBonus: String(calculation.kpiBonus), lateDeduction: String(calculation.lateDeduction), absenceDeduction: String(calculation.absenceDeduction), leaveDeduction: "0", rewardsTotal: String(calculation.rewardsTotal), penaltiesTotal: String(calculation.penaltiesTotal), attendanceCompliancePercentage: String(attendanceSummary.complianceScore), netSalary: String(calculation.netSalary), calculationSnapshot: { period: { year: input.year, month: input.month }, attendance: attendanceSummary, absentDays, rawLateMinutes, lateMinutes, latePolicy: policy ? { graceMinutes: policy.graceMinutes, lateMultiplier: toNumber(policy.lateMultiplier), monthlyLateMinuteCap: policy.monthlyLateMinuteCap } : null, kpiScore, appliedAdjustmentIds, ...calculation } });
        for (const adjustmentId of appliedAdjustmentIds) await db.update(payrollAdjustments).set({ payrollRunId: run.id, status: "applied", appliedAt: new Date() }).where(eq(payrollAdjustments.id, adjustmentId));
        createdItems += 1;
      }
      return { success: true, payrollRunId: run.id, createdItems, createdAdjustments };
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
    readiness: payrollProcedure.input(z.object({ branchId: z.number().int().positive(), year: z.number().int().min(2024).max(2100), month: z.number().int().min(1).max(12) })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const from = new Date(input.year, input.month - 1, 1);
      const to = new Date(input.year, input.month, 0, 23, 59, 59, 999);
      const [team, structures, adjustments, run] = await Promise.all([
        db.select().from(employees).where(and(eq(employees.branchId, input.branchId), eq(employees.employmentStatus, "active"))).orderBy(asc(employees.fullName)),
        db.select().from(salaryStructures).where(and(lte(salaryStructures.effectiveFrom, to), or(isNull(salaryStructures.effectiveTo), gte(salaryStructures.effectiveTo, from)))).orderBy(desc(salaryStructures.effectiveFrom)),
        db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.branchId, input.branchId), eq(payrollAdjustments.status, "pending"), gte(payrollAdjustments.occurrenceDate, from), lte(payrollAdjustments.occurrenceDate, to))),
        db.select().from(payrollRuns).where(and(eq(payrollRuns.branchId, input.branchId), eq(payrollRuns.year, input.year), eq(payrollRuns.month, input.month))).limit(1),
      ]);
      const readiness = team.map(employee => {
        const salary = structures.find(item => item.employeeId === employee.id);
        const pendingAdjustments = adjustments.filter(item => item.employeeId === employee.id).length;
        const blockers = [!salary ? "missing_salary_structure" : null, pendingAdjustments ? "pending_adjustment_review" : null].filter(Boolean) as ("missing_salary_structure" | "pending_adjustment_review")[];
        return { employeeId: employee.id, fullName: employee.fullName, employeeCode: employee.employeeCode, hasSalaryStructure: Boolean(salary), pendingAdjustments, status: blockers.length ? "needs_review" as const : "ready" as const, blockers };
      });
      return { period: { year: input.year, month: input.month }, existingRun: run[0] ?? null, totalEmployees: readiness.length, readyEmployees: readiness.filter(item => item.status === "ready").length, needsReviewEmployees: readiness.filter(item => item.status === "needs_review").length, pendingAdjustments: adjustments.length, employees: readiness };
    }),
    submitBatchForApproval: managerProcedure.input(z.object({ branchId: z.number().int().positive(), payrollRunIds: z.array(z.number().int().positive()).min(1).max(25) }).refine(input => new Set(input.payrollRunIds).size === input.payrollRunIds.length, { message: "توجد مسيرات مكررة في طلب الاعتماد." })).mutation(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      const runs = await Promise.all(input.payrollRunIds.map(id => db.select().from(payrollRuns).where(eq(payrollRuns.id, id)).limit(1).then(rows => rows[0])));
      if (runs.some(run => !run || run.branchId !== input.branchId)) throw new TRPCError({ code: "FORBIDDEN", message: "تتضمن الدفعة مسيراً خارج نطاق الفرع أو غير موجود." });
      if (runs.some(run => run!.status !== "draft" && run!.status !== "rejected")) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن إرسال كل المسيرات المختارة لاعتماد المدير في حالتها الحالية." });
      await db.transaction(async tx => { for (const run of runs) await tx.update(payrollRuns).set({ status: "pending_manager" }).where(eq(payrollRuns.id, run!.id)); });
      return { success: true, submittedCount: runs.length };
    }),
    listRuns: payrollProcedure.input(z.object({ branchId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertBranchScope(ctx.user, input.branchId);
      const db = await requireDb();
      return db.select().from(payrollRuns).where(eq(payrollRuns.branchId, input.branchId)).orderBy(desc(payrollRuns.year), desc(payrollRuns.month));
    }),
  }),
});

export type AppRouter = typeof appRouter;
