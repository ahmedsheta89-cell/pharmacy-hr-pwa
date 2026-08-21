import type { QrAttendanceAction } from "../shared/attendance-qr";

export class AttendanceQrWorkflowError extends Error {
  constructor(public code: "BAD_REQUEST" | "FORBIDDEN" | "CONFLICT", message: string) {
    super(message);
  }
}

type EmployeeProfile = { id: number; branchId: number };
type AttendanceRecord = { id: number; checkInAt: Date | null; checkOutAt: Date | null };
type Assignment = { assignmentId: number; startTime: string; graceMinutes: number } | null;
type CheckInValues = { employeeId: number; shiftAssignmentId: number | null; workDate: Date; checkInAt: Date; lateMinutes: number; status: "present" | "late" };
type CheckOutValues = { checkOutAt: Date; workedMinutes: number };

export type AttendanceQrRepository = {
  getEmployeeProfile: (userId: number) => Promise<EmployeeProfile | null>;
  findTodayRecord: (employeeId: number, workDate: Date) => Promise<AttendanceRecord | null>;
  findTodayAssignment: (employeeId: number, workDate: Date) => Promise<Assignment>;
  createRecord: (values: CheckInValues) => Promise<void>;
  updateCheckIn: (recordId: number, values: Omit<CheckInValues, "employeeId" | "workDate">) => Promise<void>;
  updateCheckOut: (recordId: number, values: CheckOutValues) => Promise<void>;
};

type WorkflowInput = { token: string; userId: number; now?: Date; verify: (token: string) => Promise<{ branchId: number; action: QrAttendanceAction }>; repository: AttendanceQrRepository };

function dayStart(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function calculateLateMinutes(now: Date, workDate: Date, startTime: string, graceMinutes: number) {
  const [hours = 0, minutes = 0] = startTime.split(":").map(Number);
  const scheduled = dayStart(workDate);
  scheduled.setHours(hours, minutes + graceMinutes, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - scheduled.getTime()) / 60000));
}

async function authorize(input: WorkflowInput, expectedAction: QrAttendanceAction) {
  let claims: { branchId: number; action: QrAttendanceAction };
  try {
    claims = await input.verify(input.token);
  } catch {
    throw new AttendanceQrWorkflowError("BAD_REQUEST", "رمز QR غير صالح أو انتهت صلاحيته.");
  }
  if (claims.action !== expectedAction) {
    throw new AttendanceQrWorkflowError("BAD_REQUEST", expectedAction === "check_in" ? "هذا الرمز مخصص لتسجيل الانصراف." : "هذا الرمز مخصص لتسجيل الحضور.");
  }
  const employee = await input.repository.getEmployeeProfile(input.userId);
  if (!employee) throw new AttendanceQrWorkflowError("FORBIDDEN", "لم يُربط حسابك بعد بملف موظف.");
  if (employee.branchId !== claims.branchId) throw new AttendanceQrWorkflowError("FORBIDDEN", "رمز QR لا يخص فرعك.");
  return employee;
}

export async function recordCheckInByQr(input: WorkflowInput) {
  const employee = await authorize(input, "check_in");
  const now = input.now ?? new Date();
  const workDate = dayStart(now);
  const existing = await input.repository.findTodayRecord(employee.id, workDate);
  if (existing?.checkInAt) throw new AttendanceQrWorkflowError("CONFLICT", "تم تسجيل الحضور بالفعل اليوم.");
  const assignment = await input.repository.findTodayAssignment(employee.id, workDate);
  const lateMinutes = assignment ? calculateLateMinutes(now, workDate, assignment.startTime, assignment.graceMinutes) : 0;
  const status: "present" | "late" = lateMinutes > 0 ? "late" : "present";
  const values = { shiftAssignmentId: assignment?.assignmentId ?? null, checkInAt: now, lateMinutes, status };
  if (existing) await input.repository.updateCheckIn(existing.id, values);
  else await input.repository.createRecord({ employeeId: employee.id, workDate, ...values });
  return { success: true, lateMinutes };
}

export async function recordCheckOutByQr(input: WorkflowInput) {
  const employee = await authorize(input, "check_out");
  const now = input.now ?? new Date();
  const workDate = dayStart(now);
  const record = await input.repository.findTodayRecord(employee.id, workDate);
  if (!record?.checkInAt) throw new AttendanceQrWorkflowError("BAD_REQUEST", "سجّل الحضور أولاً قبل الانصراف.");
  if (record.checkOutAt) throw new AttendanceQrWorkflowError("CONFLICT", "تم تسجيل الانصراف بالفعل.");
  const workedMinutes = Math.max(0, Math.floor((now.getTime() - record.checkInAt.getTime()) / 60000));
  await input.repository.updateCheckOut(record.id, { checkOutAt: now, workedMinutes });
  return { success: true, workedMinutes };
}
