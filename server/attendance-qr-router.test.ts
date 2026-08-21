import { describe, expect, it, vi } from "vitest";
import { createAttendanceQrToken } from "../shared/attendance-qr";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";

type TestRecord = { id: number; checkInAt: Date | null; checkOutAt: Date | null; workedMinutes?: number; [key: string]: unknown };

const fixture = vi.hoisted(() => {
  const records: TestRecord[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => records.length ? [records[0]] : [] }),
        innerJoin: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    }),
    insert: () => ({ values: async (values: Record<string, unknown>) => { records.push({ id: 1, checkInAt: values.checkInAt as Date, checkOutAt: null, ...values }); } }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { if (records[0]) Object.assign(records[0], values); } }) }),
  };
  return { records, db };
});

vi.mock("./db", () => ({
  getDb: async () => fixture.db,
  getEmployeeByUserId: async () => ({ id: 44, branchId: 7 }),
}));

import { appRouter } from "./routers";

function context(): TrpcContext {
  return {
    user: { id: 8, openId: "qr-router-test", name: "QR Test", email: "qr@example.com", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("إجراءات tRPC للحضور عبر QR", () => {
  it("تنشئ سجل حضور وتحدّثه بالانصراف عند رمز صالح", async () => {
    fixture.records.length = 0;
    const caller = appRouter.createCaller(context());
    const checkIn = await createAttendanceQrToken({ branchId: 7, action: "check_in" }, ENV.cookieSecret);
    await expect(caller.attendance.checkInByQr({ token: checkIn.token })).resolves.toMatchObject({ success: true });
    expect(fixture.records[0]?.checkInAt).toBeInstanceOf(Date);

    const checkOut = await createAttendanceQrToken({ branchId: 7, action: "check_out" }, ENV.cookieSecret);
    await expect(caller.attendance.checkOutByQr({ token: checkOut.token })).resolves.toMatchObject({ success: true });
    expect(fixture.records[0]?.checkOutAt).toBeInstanceOf(Date);
  });

  it("يرفض الرموز غير الصالحة والمنتهية من إجراء tRPC دون تعديل السجل", async () => {
    fixture.records.length = 0;
    const caller = appRouter.createCaller(context());
    await expect(caller.attendance.checkInByQr({ token: "invalid-qr-token-that-is-long-enough" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const expired = await createAttendanceQrToken({ branchId: 7, action: "check_in" }, ENV.cookieSecret, new Date(Date.now() - 11 * 60 * 1000));
    await expect(caller.attendance.checkInByQr({ token: expired.token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.records).toHaveLength(0);
  });
});
