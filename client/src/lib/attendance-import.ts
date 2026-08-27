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

export type AttendanceImportStatus = "present" | "absent" | "excused";

export type AttendanceImportRowEdit = {
  employeeCode: string;
  workDate: string;
  checkInTime: string;
  checkOutTime: string;
  status: AttendanceImportStatus;
};

export type AttendanceImportDraft = {
  sourceFormat: "xlsx" | "csv";
  sourceFileName: string;
  headers: string[];
  rows: AttendanceImportDraftRow[];
  issues: string[];
  detectedLayout: "standard" | "device_report";
};

export type AttendanceImportProgress = {
  phase: "reading" | "validating" | "ready" | "error";
  value: number;
  message: string;
};

export type AttendanceImportFileSelection = {
  name: string;
  sizeBytes: number;
  sizeLabel: string;
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
  employee_header_incomplete: "تعذر استخراج كود الموظف من رأس التقرير",
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

function parseReportTimestamp(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value);
  const text = arabicDigitsToLatin(String(value ?? "")).trim();
  const dateTime = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|ص|م)?$/i);
  if (!dateTime) return undefined;
  let hours = Number(dateTime[4]);
  const marker = dateTime[7]?.toLowerCase();
  if (marker === "pm" || marker === "م") hours = hours === 12 ? 12 : hours + 12;
  if (marker === "am" || marker === "ص") hours = hours === 12 ? 0 : hours;
  if (hours > 23 || Number(dateTime[5]) > 59 || Number(dateTime[6] ?? 0) > 59) return undefined;
  return new Date(Number(dateTime[3]), Number(dateTime[2]) - 1, Number(dateTime[1]), hours, Number(dateTime[5]), Number(dateTime[6] ?? 0));
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

function isoDateValue(value?: Date) {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeValue(value?: Date) {
  if (!value) return "";
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

export function getAttendanceImportRowEdit(row: AttendanceImportDraftRow): AttendanceImportRowEdit {
  return { employeeCode: row.employeeCode, workDate: isoDateValue(row.workDate), checkInTime: timeValue(row.checkInAt), checkOutTime: timeValue(row.checkOutAt), status: row.status ?? "present" };
}

export function reviseAttendanceImportRow(row: AttendanceImportDraftRow, edit: AttendanceImportRowEdit): AttendanceImportDraftRow {
  const employeeCode = edit.employeeCode.trim();
  const workDate = parseDate(edit.workDate);
  const status = edit.status;
  const checkInAt = status === "present" ? parseDateTime(workDate, edit.checkInTime) : undefined;
  const checkOutAt = status === "present" ? parseDateTime(workDate, edit.checkOutTime) : undefined;
  const issues: string[] = [];
  if (!employeeCode) issues.push("missing_employee_code");
  if (!workDate) issues.push("missing_work_date");
  if (status === "present" && Boolean(checkInAt) !== Boolean(checkOutAt)) issues.push("missing_time_pair");
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) issues.push("invalid_time_order");
  return { ...row, employeeCode, workDate, checkInAt, checkOutAt, status, issues };
}

export function exportAttendanceImportErrorRows(sourceFileName: string, rows: AttendanceImportDraftRow[]) {
  const errorRows = rows.filter(row => row.issues.length > 0);
  const headers = ["رقم صف المصدر", "كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف", "الحالة", "أخطاء تحتاج تصحيحاً"];
  const content = errorRows.map(row => [row.rowNumber, row.employeeCode, isoDateValue(row.workDate), timeValue(row.checkInAt), timeValue(row.checkOutAt), { present: "حاضر", absent: "غائب", excused: "بعذر" }[row.status ?? "present"], row.issues.map(issueLabel).join("، ")]);
  const safeName = sourceFileName.replace(/\.[^.]+$/, "").slice(0, 80) || "استيراد-الحضور";
  const blob = new Blob([createExcelWorkbook(headers, content, "صفوف للمراجعة")], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeName}-صفوف-للمراجعة.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function hasDeviceReportHeader(row: unknown[]) {
  const values = row.map(normalize);
  return values.includes("الكود") && (values.includes("الاسم") || values.includes("الإسم"));
}

function parseDeviceReportRows(sourceFileName: string, sourceFormat: "xlsx" | "csv", grid: unknown[][]): AttendanceImportDraft | null {
  if (!grid.some(hasDeviceReportHeader)) return null;
  let employeeCode = "";
  let employeeName = "";
  const rows: AttendanceImportDraftRow[] = [];
  const issues: string[] = [];

  grid.forEach((row, index) => {
    if (hasDeviceReportHeader(row)) {
      const normalizedValues = row.map(normalize);
      const codeLabelIndex = normalizedValues.indexOf("الكود");
      const nameLabelIndex = normalizedValues.findIndex(value => value === "الاسم" || value === "الإسم");
      employeeCode = String(valueAt(row, codeLabelIndex - 1)).trim();
      employeeName = String(valueAt(row, nameLabelIndex - 1)).trim();
      if (!employeeCode) issues.push(`تعذر استخراج كود الموظف من رأس التقرير عند الصف ${index + 1}.`);
      return;
    }

    const checkOutAt = parseReportTimestamp(valueAt(row, 5));
    const checkInAt = parseReportTimestamp(valueAt(row, 6));
    if (!checkInAt && !checkOutAt) return;
    const workDate = checkInAt ? parseDate(checkInAt) : parseDate(checkOutAt);
    const rowIssues: string[] = [];
    if (!employeeCode) rowIssues.push("employee_header_incomplete");
    if (!workDate) rowIssues.push("missing_work_date");
    if (Boolean(checkInAt) !== Boolean(checkOutAt)) rowIssues.push("missing_time_pair");
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) rowIssues.push("invalid_time_order");
    rows.push({ rowNumber: index + 1, employeeCode, workDate, checkInAt, checkOutAt, status: "present", issues: rowIssues });
  });

  return {
    sourceFileName,
    sourceFormat,
    headers: ["كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف"],
    rows,
    issues: rows.length ? issues : [...issues, "تم التعرف على تقرير بصمة، لكن لم تُعثر على سجلات حضور أو انصراف قابلة للقراءة."],
    detectedLayout: "device_report",
  };
}

export function parseAttendanceRows(sourceFileName: string, sourceFormat: "xlsx" | "csv", grid: unknown[][]): AttendanceImportDraft {
  const deviceReport = parseDeviceReportRows(sourceFileName, sourceFormat, grid);
  if (deviceReport) return deviceReport;
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
  return { sourceFileName, sourceFormat, headers, rows, issues, detectedLayout: "standard" };
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

export function validateAttendanceImportFile(file: Pick<File, "name" | "size">): "xlsx" | "csv" {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension !== "xlsx" && extension !== "csv") throw new Error("يُسمح فقط بملفات Excel الحديثة ‏(.xlsx) أو CSV. حوّل ملف ‎.xls‎ القديم إلى ‎.xlsx‎ ثم أعد المحاولة.");
  if (file.size > 5 * 1024 * 1024) throw new Error("يجب ألا يتجاوز حجم الملف 5 ميجابايت.");
  return extension;
}

export function describeAttendanceImportFile(file: Pick<File, "name" | "size">): AttendanceImportFileSelection {
  const sizeInKilobytes = file.size / 1024;
  const sizeLabel = sizeInKilobytes < 1024 ? `${Math.max(1, Math.round(sizeInKilobytes))} كيلوبايت` : `${(sizeInKilobytes / 1024).toFixed(1)} ميجابايت`;
  return { name: file.name, sizeBytes: file.size, sizeLabel };
}

export function getAttendanceImportSelectionMessage(file: Pick<File, "name" | "size">) {
  const selectedFile = describeAttendanceImportFile(file);
  return `تم اختيار «${selectedFile.name}» بحجم ${selectedFile.sizeLabel}. جارٍ تجهيز المعاينة.`;
}

export async function parseAttendanceFile(file: File, onProgress?: (progress: AttendanceImportProgress) => void) {
  const extension = validateAttendanceImportFile(file);
  onProgress?.({ phase: "reading", value: 25, message: "جارٍ قراءة الملف واستخراج الصفوف…" });
  const grid = extension === "xlsx" ? await readSheet(file, 1) : parseCsvGrid(await file.text());
  if (!grid.length) throw new Error("لا توجد ورقة بيانات قابلة للقراءة في الملف.");
  onProgress?.({ phase: "validating", value: 75, message: "جارٍ التحقق من الأكواد والتواريخ وأوقات الحضور…" });
  const draft = parseAttendanceRows(file.name, extension, grid);
  onProgress?.({ phase: "ready", value: 100, message: `اكتملت المعاينة: ${draft.rows.length} صف جاهز للمراجعة.` });
  return draft;
}

export function downloadAttendanceImportTemplate() {
  const headers = ["كود الموظف", "تاريخ العمل", "وقت الحضور", "وقت الانصراف", "الحالة"];
  const blob = new Blob([createExcelWorkbook(headers, [], "استيراد الحضور")], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "قالب-حضور-فارغ.xlsx";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
