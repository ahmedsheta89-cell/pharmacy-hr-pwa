import {
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const employeeRoleValues = ["user", "admin", "owner", "manager", "hr_manager", "pharmacist", "employee"] as const;
export type EmployeeRole = (typeof employeeRoleValues)[number];

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", employeeRoleValues).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  address: text("address"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  geofenceRadiusMeters: int("geofenceRadiusMeters").default(80).notNull(),
  managerEmployeeId: int("managerEmployeeId"),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("branches_code_unique").on(table.code)]);

export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  branchId: int("branchId").notNull().references(() => branches.id),
  employeeCode: varchar("employeeCode", { length: 32 }).notNull(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  nationalId: varchar("nationalId", { length: 48 }),
  email: varchar("email", { length: 320 }),
  jobTitle: varchar("jobTitle", { length: 120 }).notNull(),
  role: mysqlEnum("role", employeeRoleValues).default("employee").notNull(),
  hireDate: date("hireDate").notNull(),
  birthDate: date("birthDate"),
  address: text("address"),
  emergencyContactName: varchar("emergencyContactName", { length: 160 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 32 }),
  profilePhotoUrl: text("profilePhotoUrl"),
  employmentStatus: mysqlEnum("employmentStatus", ["active", "inactive", "on_leave"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("employees_employeeCode_unique").on(table.employeeCode),
  uniqueIndex("employees_userId_unique").on(table.userId),
  index("employees_branch_idx").on(table.branchId),
]);

export type EmployeeAuditChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

export const employeeAuditLogs = mysqlTable("employeeAuditLogs", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actorName", { length: 160 }),
  action: mysqlEnum("action", ["created", "updated", "archived", "restored"]).notNull(),
  changes: json("changes").$type<EmployeeAuditChange[]>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("employeeAuditLogs_employee_created_idx").on(table.employeeId, table.createdAt),
  index("employeeAuditLogs_branch_created_idx").on(table.branchId, table.createdAt),
]);

export const employeeCertificates = mysqlTable("employeeCertificates", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  issuer: varchar("issuer", { length: 180 }),
  issuedOn: date("issuedOn"),
  expiresOn: date("expiresOn"),
  documentUrl: text("documentUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const shifts = mysqlTable("shifts", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  startTime: time("startTime").notNull(),
  endTime: time("endTime").notNull(),
  graceMinutes: int("graceMinutes").default(10).notNull(),
  breakMinutes: int("breakMinutes").default(0).notNull(),
  color: varchar("color", { length: 16 }).default("#13A68A").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const shiftAssignments = mysqlTable("shiftAssignments", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  shiftId: int("shiftId").notNull().references(() => shifts.id, { onDelete: "cascade" }),
  workDate: date("workDate").notNull(),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled", "absent"]).default("scheduled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("shift_assignments_employee_date_unique").on(table.employeeId, table.workDate),
  index("shift_assignments_date_idx").on(table.workDate),
]);

export const attendanceRecords = mysqlTable("attendanceRecords", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  shiftAssignmentId: int("shiftAssignmentId").references(() => shiftAssignments.id, { onDelete: "set null" }),
  workDate: date("workDate").notNull(),
  checkInAt: timestamp("checkInAt"),
  checkOutAt: timestamp("checkOutAt"),
  checkInLatitude: decimal("checkInLatitude", { precision: 10, scale: 7 }),
  checkInLongitude: decimal("checkInLongitude", { precision: 10, scale: 7 }),
  checkOutLatitude: decimal("checkOutLatitude", { precision: 10, scale: 7 }),
  checkOutLongitude: decimal("checkOutLongitude", { precision: 10, scale: 7 }),
  checkInPhotoUrl: text("checkInPhotoUrl"),
  workedMinutes: int("workedMinutes").default(0).notNull(),
  lateMinutes: int("lateMinutes").default(0).notNull(),
  status: mysqlEnum("status", ["present", "late", "absent", "excused"]).default("present").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("attendance_employee_date_unique").on(table.employeeId, table.workDate),
  index("attendance_date_idx").on(table.workDate),
]);

export const leaveBalances = mysqlTable("leaveBalances", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  year: int("year").notNull(),
  annualEntitlement: decimal("annualEntitlement", { precision: 5, scale: 2 }).default("21.00").notNull(),
  sickEntitlement: decimal("sickEntitlement", { precision: 5, scale: 2 }).default("0.00").notNull(),
  annualUsed: decimal("annualUsed", { precision: 5, scale: 2 }).default("0.00").notNull(),
  sickUsed: decimal("sickUsed", { precision: 5, scale: 2 }).default("0.00").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("leave_balance_employee_year_unique").on(table.employeeId, table.year)]);

export const leaveRequests = mysqlTable("leaveRequests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  leaveType: mysqlEnum("leaveType", ["annual", "sick", "emergency", "unpaid"]).notNull(),
  startDate: date("startDate").notNull(),
  endDate: date("endDate").notNull(),
  totalDays: decimal("totalDays", { precision: 5, scale: 2 }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  reviewedByEmployeeId: int("reviewedByEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewedAt"),
  reviewerNote: text("reviewerNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("leave_requests_employee_status_idx").on(table.employeeId, table.status)]);

export const kpiDefinitions = mysqlTable("kpiDefinitions", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").references(() => branches.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  category: mysqlEnum("category", ["sales", "operations", "service", "attendance"]).notNull(),
  description: text("description"),
  unit: mysqlEnum("unit", ["currency", "number", "percentage", "minutes"]).notNull(),
  targetValue: decimal("targetValue", { precision: 14, scale: 2 }).notNull(),
  weight: decimal("weight", { precision: 5, scale: 2 }).default("1.00").notNull(),
  measurementPeriod: mysqlEnum("measurementPeriod", ["daily", "weekly", "monthly"]).default("monthly").notNull(),
  applicableRoles: json("applicableRoles").notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const kpiRecords = mysqlTable("kpiRecords", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  kpiDefinitionId: int("kpiDefinitionId").notNull().references(() => kpiDefinitions.id, { onDelete: "cascade" }),
  periodStart: date("periodStart").notNull(),
  periodEnd: date("periodEnd").notNull(),
  actualValue: decimal("actualValue", { precision: 14, scale: 2 }).notNull(),
  targetValue: decimal("targetValue", { precision: 14, scale: 2 }).notNull(),
  achievementPercentage: decimal("achievementPercentage", { precision: 6, scale: 2 }).notNull(),
  score: decimal("score", { precision: 5, scale: 2 }).notNull(),
  recordedByEmployeeId: int("recordedByEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("kpi_record_employee_definition_period_unique").on(table.employeeId, table.kpiDefinitionId, table.periodStart, table.periodEnd),
  index("kpi_records_employee_period_idx").on(table.employeeId, table.periodStart),
]);

export const performanceReviews = mysqlTable("performanceReviews", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  reviewerEmployeeId: int("reviewerEmployeeId").notNull().references(() => employees.id),
  periodLabel: varchar("periodLabel", { length: 24 }).notNull(),
  year: int("year").notNull(),
  overallScore: decimal("overallScore", { precision: 5, scale: 2 }).notNull(),
  kpiScore: decimal("kpiScore", { precision: 5, scale: 2 }).notNull(),
  behaviorScore: decimal("behaviorScore", { precision: 5, scale: 2 }).notNull(),
  developmentScore: decimal("developmentScore", { precision: 5, scale: 2 }).notNull(),
  strengths: text("strengths"),
  improvementAreas: text("improvementAreas"),
  nextGoals: json("nextGoals"),
  status: mysqlEnum("status", ["draft", "submitted", "acknowledged"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("performance_review_employee_period_unique").on(table.employeeId, table.periodLabel, table.year)]);

export const salaryStructures = mysqlTable("salaryStructures", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  basicSalary: decimal("basicSalary", { precision: 12, scale: 2 }).notNull(),
  housingAllowance: decimal("housingAllowance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  transportationAllowance: decimal("transportationAllowance", { precision: 12, scale: 2 }).default("0.00").notNull(),
  otherAllowances: decimal("otherAllowances", { precision: 12, scale: 2 }).default("0.00").notNull(),
  maximumKpiBonus: decimal("maximumKpiBonus", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lateDeductionPerMinute: decimal("lateDeductionPerMinute", { precision: 10, scale: 2 }).default("0.00").notNull(),
  effectiveFrom: date("effectiveFrom").notNull(),
  effectiveTo: date("effectiveTo"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("salary_structure_employee_effective_idx").on(table.employeeId, table.effectiveFrom)]);

export const payrollRuns = mysqlTable("payrollRuns", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id),
  year: int("year").notNull(),
  month: int("month").notNull(),
  status: mysqlEnum("status", ["draft", "pending_manager", "pending_hr", "approved", "rejected", "paid"]).default("draft").notNull(),
  approvedByEmployeeId: int("approvedByEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("payroll_run_branch_period_unique").on(table.branchId, table.year, table.month)]);

export const payrollApprovals = mysqlTable("payrollApprovals", {
  id: int("id").autoincrement().primaryKey(),
  payrollRunId: int("payrollRunId").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  approverEmployeeId: int("approverEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  approvalStage: mysqlEnum("approvalStage", ["manager", "hr_manager", "owner_override"]).notNull(),
  decision: mysqlEnum("decision", ["approved", "rejected", "returned"]).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("payrollApprovals_run_created_idx").on(table.payrollRunId, table.createdAt)]);

export const payrollItems = mysqlTable("payrollItems", {
  id: int("id").autoincrement().primaryKey(),
  payrollRunId: int("payrollRunId").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  employeeId: int("employeeId").notNull().references(() => employees.id),
  basicSalary: decimal("basicSalary", { precision: 12, scale: 2 }).notNull(),
  totalAllowances: decimal("totalAllowances", { precision: 12, scale: 2 }).default("0.00").notNull(),
  kpiScore: decimal("kpiScore", { precision: 5, scale: 2 }).default("0.00").notNull(),
  kpiBonus: decimal("kpiBonus", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lateDeduction: decimal("lateDeduction", { precision: 12, scale: 2 }).default("0.00").notNull(),
  absenceDeduction: decimal("absenceDeduction", { precision: 12, scale: 2 }).default("0.00").notNull(),
  leaveDeduction: decimal("leaveDeduction", { precision: 12, scale: 2 }).default("0.00").notNull(),
  netSalary: decimal("netSalary", { precision: 12, scale: 2 }).notNull(),
  calculationSnapshot: json("calculationSnapshot").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("payroll_item_run_employee_unique").on(table.payrollRunId, table.employeeId)]);

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  data: json("data"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("notifications_user_read_idx").on(table.userId, table.readAt)]);

export const accountLinkRequests = mysqlTable("accountLinkRequests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  requestedByUserId: int("requestedByUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedByName: varchar("requestedByName", { length: 160 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending").notNull(),
  reviewedByUserId: int("reviewedByUserId").references(() => users.id, { onDelete: "set null" }),
  reviewedByName: varchar("reviewedByName", { length: 160 }),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("accountLinkRequests_status_created_idx").on(table.status, table.createdAt),
  index("accountLinkRequests_branch_status_idx").on(table.branchId, table.status),
  index("accountLinkRequests_employee_status_idx").on(table.employeeId, table.status),
]);

export const accountLinkLogs = mysqlTable("accountLinkLogs", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  userId: int("userId").references(() => users.id, { onDelete: "set null" }),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  action: mysqlEnum("action", ["linked", "unlinked"]).notNull(),
  source: mysqlEnum("source", ["owner_direct", "owner_approved_request", "owner_self_setup"]).notNull(),
  requestId: int("requestId").references(() => accountLinkRequests.id, { onDelete: "set null" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  actorName: varchar("actorName", { length: 160 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("accountLinkLogs_employee_created_idx").on(table.employeeId, table.createdAt),
  index("accountLinkLogs_user_created_idx").on(table.userId, table.createdAt),
  index("accountLinkLogs_branch_created_idx").on(table.branchId, table.createdAt),
]);

export const attendancePolicies = mysqlTable("attendancePolicies", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  graceMinutes: int("graceMinutes").default(15).notNull(),
  lateMultiplier: decimal("lateMultiplier", { precision: 4, scale: 2 }).default("1.00").notNull(),
  monthlyLateMinuteCap: int("monthlyLateMinuteCap"),
  pointsPerLateOccurrence: int("pointsPerLateOccurrence").default(0).notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("attendance_policy_branch_unique").on(table.branchId)]);

export const deliveryOrders = mysqlTable("deliveryOrders", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  deliveryZoneId: int("deliveryZoneId").references(() => deliveryZones.id, { onDelete: "set null" }),
  orderCode: varchar("orderCode", { length: 48 }).notNull(),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  address: text("address").notNull(),
  destinationLatitude: decimal("destinationLatitude", { precision: 10, scale: 7 }),
  destinationLongitude: decimal("destinationLongitude", { precision: 10, scale: 7 }),
  promisedAt: timestamp("promisedAt"),
  slaDueAt: timestamp("slaDueAt"),
  slaAlertedAt: timestamp("slaAlertedAt"),
  status: mysqlEnum("status", ["draft", "ready", "assigned", "picked_up", "en_route", "delivered", "failed", "returned", "cancelled"]).default("draft").notNull(),
  assignedEmployeeId: int("assignedEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  pickedUpAt: timestamp("pickedUpAt"),
  deliveredAt: timestamp("deliveredAt"),
  proofNote: text("proofNote"),
  exceptionReason: text("exceptionReason"),
  notes: text("notes"),
  createdByUserId: int("createdByUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("delivery_orders_branch_code_unique").on(table.branchId, table.orderCode),
  index("delivery_orders_branch_status_idx").on(table.branchId, table.status),
  index("delivery_orders_employee_status_idx").on(table.assignedEmployeeId, table.status),
  index("delivery_orders_sla_due_idx").on(table.branchId, table.slaDueAt),
]);

export const deliveryZones = mysqlTable("deliveryZones", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 32 }),
  description: text("description"),
  slaMinutes: int("slaMinutes").default(60).notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("delivery_zone_branch_name_unique").on(table.branchId, table.name),
  index("delivery_zone_branch_active_idx").on(table.branchId, table.isActive),
]);

export const deliveryEvents = mysqlTable("deliveryEvents", {
  id: int("id").autoincrement().primaryKey(),
  deliveryOrderId: int("deliveryOrderId").notNull().references(() => deliveryOrders.id, { onDelete: "cascade" }),
  actorEmployeeId: int("actorEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  action: mysqlEnum("action", ["created", "assigned", "picked_up", "en_route", "delivered", "failed", "returned", "cancelled", "note"]).notNull(),
  note: text("note"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  accuracyMeters: int("accuracyMeters"),
  occurredAt: timestamp("occurredAt").defaultNow().notNull(),
}, table => [index("delivery_events_order_time_idx").on(table.deliveryOrderId, table.occurredAt)]);

export const deliveryLocationPings = mysqlTable("deliveryLocationPings", {
  id: int("id").autoincrement().primaryKey(),
  deliveryOrderId: int("deliveryOrderId").notNull().references(() => deliveryOrders.id, { onDelete: "cascade" }),
  employeeId: int("employeeId").notNull().references(() => employees.id, { onDelete: "cascade" }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  accuracyMeters: int("accuracyMeters"),
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
}, table => [index("delivery_pings_order_time_idx").on(table.deliveryOrderId, table.capturedAt)]);

export const deliveryProofImages = mysqlTable("deliveryProofImages", {
  id: int("id").autoincrement().primaryKey(),
  deliveryOrderId: int("deliveryOrderId").notNull().references(() => deliveryOrders.id, { onDelete: "cascade" }),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 96 }).notNull(),
  caption: varchar("caption", { length: 500 }),
  uploadedByEmployeeId: int("uploadedByEmployeeId").references(() => employees.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("delivery_proof_order_time_idx").on(table.deliveryOrderId, table.createdAt)]);

export const chatConversations = mysqlTable("chatConversations", {
  id: int("id").autoincrement().primaryKey(),
  publicToken: varchar("publicToken", { length: 64 }).notNull(),
  branchId: int("branchId").references(() => branches.id, { onDelete: "set null" }),
  customerName: varchar("customerName", { length: 160 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  subject: varchar("subject", { length: 220 }),
  status: mysqlEnum("status", ["open", "pending", "closed"]).default("open").notNull(),
  assignedUserId: int("assignedUserId").references(() => users.id, { onDelete: "set null" }),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("chat_conversations_public_token_unique").on(table.publicToken), index("chat_conversations_status_time_idx").on(table.status, table.lastMessageAt)]);

export const chatMessages = mysqlTable("chatMessages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  sender: mysqlEnum("sender", ["customer", "agent", "system"]).notNull(),
  body: text("body").notNull(),
  authorUserId: int("authorUserId").references(() => users.id, { onDelete: "set null" }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("chat_messages_conversation_time_idx").on(table.conversationId, table.createdAt)]);

export const faqEntries = mysqlTable("faqEntries", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").references(() => branches.id, { onDelete: "cascade" }),
  question: varchar("question", { length: 300 }).notNull(),
  answer: text("answer").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("faq_branch_active_idx").on(table.branchId, table.isActive)]);

export const quickReplies = mysqlTable("quickReplies", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").references(() => branches.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 160 }).notNull(),
  body: text("body").notNull(),
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("quick_replies_branch_active_idx").on(table.branchId, table.isActive)]);

export const customerContactLogs = mysqlTable("customerContactLogs", {
  id: int("id").autoincrement().primaryKey(),
  branchId: int("branchId").references(() => branches.id, { onDelete: "set null" }),
  conversationId: int("conversationId").references(() => chatConversations.id, { onDelete: "set null" }),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  channel: mysqlEnum("channel", ["whatsapp_link"]).notNull(),
  body: text("body").notNull(),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("contact_logs_phone_time_idx").on(table.customerPhone, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Employee = typeof employees.$inferSelect;
