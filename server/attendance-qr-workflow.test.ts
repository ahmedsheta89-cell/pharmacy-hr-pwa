import { describe, expect, it } from "vitest";
import { createAttendanceQrToken, verifyAttendanceQrToken } from "../shared/attendance-qr";
import { AttendanceQrWorkflowError, recordCheckInByQr, recordCheckOutByQr, type AttendanceQrRepository } from "./attendance-qr-workflow";

const secret = "integration-test-secret-long-enough";
const now = new Date(Date.now() + 60 * 1000);
const scheduledStart = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

function createRepository() {
  const records: Array<{ id: number; checkInAt: Date | null; checkOutAt: Date | null; workedMinutes?: number; status?: string }> = [];
  const repository: AttendanceQrRepository = {
    getEmployeeProfile: async () => ({ id: 41, branchId: 9 }),
    findTodayRecord: async () => records[0] ?? null,
    findTodayAssignment: async () => ({ assignmentId: 4, startTime: scheduledStart, graceMinutes: 10 }),
    createRecord: async values => { records.push({ id: 1, checkInAt: values.checkInAt, checkOutAt: null, status: values.status }); },
    updateCheckIn: async (id, values) => { const record = records.find(item => item.id === id); if (record) Object.assign(record, values); },
    updateCheckOut: async (id, values) => { const record = records.find(item => item.id === id); if (record) Object.assign(record, values); },
  };
  return { repository, records };
}

describe("تكامل تدفق الحضور والانصراف عبر QR", () => {
  it("ينشئ سجل حضور ثم يحدّثه بالانصراف عند استعمال الرموز الصحيحة", async () => {
    const { repository, records } = createRepository();
    const checkIn = await createAttendanceQrToken({ branchId: 9, action: "check_in" }, secret, now);
    await expect(recordCheckInByQr({ token: checkIn.token, userId: 10, now, verify: token => verifyAttendanceQrToken(token, secret), repository })).resolves.toEqual({ success: true, lateMinutes: 0 });
    expect(records[0]).toMatchObject({ checkInAt: now, checkOutAt: null, status: "present" });

    const checkOut = await createAttendanceQrToken({ branchId: 9, action: "check_out" }, secret, now);
    const finish = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    await expect(recordCheckOutByQr({ token: checkOut.token, userId: 10, now: finish, verify: token => verifyAttendanceQrToken(token, secret), repository })).resolves.toEqual({ success: true, workedMinutes: 480 });
    expect(records[0]).toMatchObject({ checkOutAt: finish, workedMinutes: 480 });
  });

  it("يرفض الرمز غير الصالح والرمز المنتهي قبل تعديل سجل الحضور", async () => {
    const { repository, records } = createRepository();
    await expect(recordCheckInByQr({ token: "invalid-token", userId: 10, now, verify: token => verifyAttendanceQrToken(token, secret), repository })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<AttendanceQrWorkflowError>);
    const expired = await createAttendanceQrToken({ branchId: 9, action: "check_in" }, secret, new Date(now.getTime() - 11 * 60 * 1000));
    await expect(recordCheckInByQr({ token: expired.token, userId: 10, now, verify: token => verifyAttendanceQrToken(token, secret), repository })).rejects.toMatchObject({ code: "BAD_REQUEST" } satisfies Partial<AttendanceQrWorkflowError>);
    expect(records).toHaveLength(0);
  });
});
