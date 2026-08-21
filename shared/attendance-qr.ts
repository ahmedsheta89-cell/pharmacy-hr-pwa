import { SignJWT, jwtVerify } from "jose";

export type QrAttendanceAction = "check_in" | "check_out";

type AttendanceQrClaims = {
  branchId: number;
  action: QrAttendanceAction;
};

function signingKey(secret: string) {
  if (secret.length < 16) throw new Error("QR attendance signing secret is not configured.");
  return new TextEncoder().encode(secret);
}

export async function createAttendanceQrToken(claims: AttendanceQrClaims, secret: string, now = new Date()) {
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setIssuer("pharmacy-people")
    .setAudience("attendance")
    .sign(signingKey(secret));
  return { token, expiresAt };
}

export async function verifyAttendanceQrToken(token: string, secret: string): Promise<AttendanceQrClaims> {
  const { payload } = await jwtVerify(token, signingKey(secret), { issuer: "pharmacy-people", audience: "attendance" });
  if (!Number.isInteger(payload.branchId) || (payload.action !== "check_in" && payload.action !== "check_out")) throw new Error("Invalid QR attendance token.");
  return { branchId: payload.branchId as number, action: payload.action };
}
