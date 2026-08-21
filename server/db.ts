import { and, desc, eq, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { attendanceRecords, employees, InsertUser, kpiRecords, leaveBalances, leaveRequests, shiftAssignments, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployeeByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result[0];
}

export async function getEmployeeDashboardData(employeeId: number, periodStart: Date, periodEnd: Date) {
  const db = await getDb();
  if (!db) return { attendance: [], shifts: [], leaveBalances: [], leaveRequests: [], kpis: [] };

  const [attendance, shifts, balances, requests, kpis] = await Promise.all([
    db.select().from(attendanceRecords).where(and(eq(attendanceRecords.employeeId, employeeId), gte(attendanceRecords.workDate, periodStart), lte(attendanceRecords.workDate, periodEnd))).orderBy(desc(attendanceRecords.workDate)),
    db.select().from(shiftAssignments).where(and(eq(shiftAssignments.employeeId, employeeId), gte(shiftAssignments.workDate, periodStart), lte(shiftAssignments.workDate, periodEnd))).orderBy(shiftAssignments.workDate),
    db.select().from(leaveBalances).where(eq(leaveBalances.employeeId, employeeId)),
    db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId)).orderBy(desc(leaveRequests.createdAt)),
    db.select().from(kpiRecords).where(and(eq(kpiRecords.employeeId, employeeId), gte(kpiRecords.periodStart, periodStart), lte(kpiRecords.periodEnd, periodEnd))).orderBy(desc(kpiRecords.periodEnd)),
  ]);

  return { attendance, shifts, leaveBalances: balances, leaveRequests: requests, kpis };
}
