import { describe, expect, it } from "vitest";
import { createAttendanceQrToken, verifyAttendanceQrToken } from "../shared/attendance-qr";

describe("رمز حضور QR", () => {
  it("يصدر رمزاً صالحاً ومقيداً بالفرع ونوع الحركة", async () => {
    const { token } = await createAttendanceQrToken({ branchId: 7, action: "check_in" }, "test-secret-must-be-long-enough");
    await expect(verifyAttendanceQrToken(token, "test-secret-must-be-long-enough")).resolves.toEqual({ branchId: 7, action: "check_in" });
  });

  it("يرفض الرمز عند اختلاف مفتاح التوقيع", async () => {
    const { token } = await createAttendanceQrToken({ branchId: 7, action: "check_out" }, "test-secret-must-be-long-enough");
    await expect(verifyAttendanceQrToken(token, "different-secret-must-be-long")).rejects.toThrow();
  });

  it("يرفض رمزاً انتهت صلاحيته", async () => {
    const expiredNow = new Date(Date.now() - 11 * 60 * 1000);
    const { token } = await createAttendanceQrToken({ branchId: 7, action: "check_in" }, "test-secret-must-be-long-enough", expiredNow);
    await expect(verifyAttendanceQrToken(token, "test-secret-must-be-long-enough")).rejects.toThrow();
  });
});
