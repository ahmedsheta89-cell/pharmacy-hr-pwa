import { readSheet } from "read-excel-file/browser";
import { createExcelWorkbook } from "./excel-export";

export type AttendanceImportDraftRow = {
  rowNumber: number;
  employeeCode: string;
  workDate?: Date;
  checkInAt?: Date;
  checkOutAt?: Date;
  status?: "present" | "absent" | "excused";
  issues: string[];
};

export type AttendanceImportDraft = {
  sourceFormat: "xlsx" | "csv";
  sourceFileName: string;
  headers: string[];
  rows: AttendanceImportDraftRow[];
  issues: string[];
};

type CanonicalColumn = "employeeCode" | "workDate" | "checkIn" | "checkOut" | "status";

const headerAliases: Record<CanonicalColumn, string[]> = {
  employeeCode: ["employee code", "employeecode", "employee id", "employeeid", "code", "كود الموظف", "كود", "رقم الموظف", "معرف الموظف"],
  workDate: ["date", "work date", "workdate", "attendance date", "التاريخ", "تاريخ العمل", "تاريخ الحضور"],
  checkIn: ["check in", "checkin", "time in", "in time", "attendance in", "وقت الحضور", "حضور", "دخول", "وقت الدخول"],
  checkOut: ["check out", "checkout", "time out", "out time", "attendance out", "وقت الانصراف", "انصراف", "خروج", "وقت الخروج"],
  status: ["status", "attendance status", "الحالة", "حالة الحضور"],
};

const issueLabels: Record<string, string> = {
  missing_employee_code: "كود الموظف مفقود",
  missing_work_date: "تاريخ العمل مفقود أو غير صالح",
  missing_time_pair: "وقت الحضور والانصراف يجب أن يُدخلا معاً",
  invalid_time_order: "وقت الانصراف يجب أن يكون بعد وقت الحضور",
  invalid_status: "حالة الحضور غير معروفة",
  empty_row: "صف فارغ",
};

function arabicDigitsToLatin(value: string) {
  return value.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function normalize(value: unknown) {
  return arabicDigitsToLatin(String(value ?? "")).trim().toLocaleLowerCase("en").replace(/[\u064B-\u065F]/g, "").replace(/[ـ_\-]/g, " ").replace(/\s+/g, " ");
}

function findColumn(headers: string[], target: CanonicalColumn) {
  return headers.findIndex(header => headerAliases[target].includes(normalize(header)));
}

function valueAt(row: unknown[], index: number) {
  return index < 0 ? "" : row[index] ?? "";
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const text = normalize(value);
  if (!text) return undefined;
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const regional = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (regional) return new Date(Number(regional[3]), Number(regional[2]) - 1, Number(regional[1]));
  const native = new Date(text);
  return Number.isNaN(native.getTime()) ? undefined : new Date(native.getFullYear(), native.getMonth(), native.getDate());
}

function parseDateTime(workDate: Date | undefined, value: unknown) {
  if (!workDate || value === null || value === undefined || String(value).trim() === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
  const text = normalize(value);
  const direct = new Date(text);
  if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(text) && !Number.isNaN(direct.getTime())) return direct;
  const time = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|ص|م)?$/i);
  if (!time) return undefined;
  let hours = Number(time[1]);
  const minutes = Number(time[2]);
  const marker = time[4]?.toLowerCase();
  if (marker === "pm" || marker === "م") hours = hours === 12 ? 12 : hours + 12;
  if (marker === "am" || marker === "ص") hours = hours === 12 ? 0 : hours;
  if (hours > 23 || minutes > 59) return undefined;
  const result = new Date(workDate);
  result.setHours(hours, minutes, Number(time[3] ?? 0), 0);
  return result;
}

function parseStatus(value: unknown): { status?: "present" | "absent" | "excused"; invalid: boolean } {
  const text = normalize(value);
  if (!text) return { status: "present", invalid: false };
  if (["present", "حاضر", "حضور", "late", "متأخر"].includes(text)) return { status: "present", invalid: false };
  if (["absent", "غائب", "غياب"].includes(text)) return { status: "absent", invalid: false };
  if (["excused", "excuse", "مأذون", "بعذر", "اجازة"].includes(text)) return { status: "excused", invalid: false };
  return { invalid: true };
}

export function issueLabel(issue: string) {
  return issueLabels[issue] ?? issue;
}

export function parseAttendanceRows(sourceFileName: string, sourceFormat: "xlsx" | "csv", grid: unknown[][]): AttendanceImportDraft {
  const [headerRow = [], ...dataRows] = grid;
  const headers = headerRow.map(value => String(value ?? "").trim());
  const employeeCodeColumn = findColumn(headers, "employeeCode");
  const workDateColumn = findColumn(headers, "workDate");
  const checkInColumn = findColumn(headers, "checkIn");
  const checkOutColumn = findColumn(headers, "checkOut");
  const statusColumn = findColumn(headers, "status");
  const issues: string[] = [];
  if (employeeCodeColumn < 0) issues.push("لم يتم العثور على عمود كود الموظف.");
  if (workDateColumn < 0) issues.push("لم يتم العثور على عمود تاريخ العمل.");
  const rows = dataRows.map((row, index) => {
    const employeeCode = String(valueAt(row, employeeCodeColumn)).trim();
    const workDate = parseDate(valueAt(row, workDateColumn));
    const checkInAt = parseDateTime(workDate, valueAt(row, checkInColumn));
    const checkOutAt = parseDateTime(workDate, valueAt(row, checkOutColumn));
    const parsedStatus = parseStatus(valueAt(row, statusColumn));
    const rowIssues: string[] = [];
    if (!employeeCode && !workDate && !checkInAt && !checkOutAt) rowIssues.push("empty_row");
    if (!employeeCode) rowIssues.push("missing_employee_code");
    if (!workDate) rowIssues.push("missing_work_date");
    if (Boolean(checkInAt) !== Boolean(checkOutAt) && parsedStatus.status === "present") rowIssues.push("missing_time_pair");
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) rowIssues.push("invalid_time_order");
    if (parsedStatus.invalid) rowIssues.push("invalid_status");
    return { rowNumber: index + 2, employeeCode, workDate, checkInAt, checkOutAt, status: parsedStatus.status, issues: rowIssues };
  }).filter(row => !row.issues.includes("empty_row"));
  return { sourceFileName, sourceFormat, headers, rows, issues };
}

function parseCsvGrid(content: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (current === '"') { quoted = !quoted; continue; }
    if (current === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((current === "\n" || current === "\r") && !quoted) {
      if (current === "\r" && next === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = ""; continue;
    }
    cell += current;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export async function parseAttendanceFile(file: File) {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("يُسمح فقط بملفات Excel ‏(.xlsx) أو CSV.");
  if (file.size > 5 * 1024 * 1024) throw new Error("يجب ألا يتجاوز حجم الملف 5 ميجابايت.");
  const grid = extension === "xlsx" ? await readSheet(file, 1) : parseCsvGrid(await file.text());
  if (!grid.length) throw new Error("لا توجد ورقة بيانات قابلة للقراءة في الملف.");
  return parseAttendanceRows(file.name, extension, grid);
}

export function downloadAttendanceImportTemplate() {
  const headers = ["كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف", "الحالة"];
  const rows = [["EMP-001", "2026-08-01", "09:00", "17:00", "حاضر"], ["EMP-002", "2026-08-01", "", "", "غائب"]];
  const blob = new Blob([createExcelWorkbook(headers, rows, "استيراد الحضور")], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "قالب-استيراد-الحضور.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
