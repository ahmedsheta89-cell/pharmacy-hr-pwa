export type CsvCell = string | number | boolean | Date | null | undefined;

export const accountLinkSourceLabels: Record<string, string> = {
  owner_direct: "ربط مباشر بواسطة المالك",
  owner_approved_request: "طلب مدير اعتمده المالك",
  owner_self_setup: "إعداد حساب المالك",
};

function displayExportValue(value: CsvCell) {
  if (value === null || value === undefined || value === "") return "—";
  if (value instanceof Date) return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(value);
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeCsv(value: CsvCell) {
  return `"${displayExportValue(value).replaceAll('"', '""')}"`;
}

export function createExcelCompatibleCsv(headers: string[], rows: CsvCell[][]) {
  return `\ufeff${[headers, ...rows].map(row => row.map(escapeCsv).join(",")).join("\r\n")}`;
}

export function downloadExcelCompatibleCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const blob = new Blob([createExcelCompatibleCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) { const remainder = (value - 1) % 26; result = String.fromCharCode(65 + remainder) + result; value = Math.floor((value - 1) / 26); }
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) { crc ^= bytes[index]; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function writeUInt32(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function joinBytes(parts: Uint8Array[]) { const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }

function createStoredZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const localRecords: Uint8Array[] = [];
  const directoryRecords: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const crc = crc32(content);
    const local = joinBytes([writeUInt32(0x04034b50), writeUInt16(20), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt32(crc), writeUInt32(content.length), writeUInt32(content.length), writeUInt16(name.length), writeUInt16(0), name, content]);
    localRecords.push(local);
    directoryRecords.push(joinBytes([writeUInt32(0x02014b50), writeUInt16(20), writeUInt16(20), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt32(crc), writeUInt32(content.length), writeUInt32(content.length), writeUInt16(name.length), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt16(0), writeUInt32(0), writeUInt32(offset), name]));
    offset += local.length;
  }
  const directory = joinBytes(directoryRecords);
  return joinBytes([...localRecords, directory, writeUInt32(0x06054b50), writeUInt16(0), writeUInt16(0), writeUInt16(files.length), writeUInt16(files.length), writeUInt32(directory.length), writeUInt32(offset), writeUInt16(0)]);
}

export function createExcelWorkbook(headers: string[], rows: CsvCell[][], sheetName = "السجل") {
  const sheetRows = [headers, ...rows].map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(displayExportValue(cell))}</t></is></c>`).join("")}</row>`).join("");
  const safeName = sheetName.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "السجل";
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"/></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>` },
  ];
  return createStoredZip(files);
}

export function downloadExcelWorkbook(filename: string, headers: string[], rows: CsvCell[][], sheetName?: string) {
  const blob = new Blob([createExcelWorkbook(headers, rows, sheetName)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

type AccountLinkExportItem = {
  employeeName: string;
  employeeCode: string;
  accountName?: string | null;
  accountEmail?: string | null;
  log: {
    userId?: number | null;
    action: "linked" | "unlinked";
    source: string;
    actorName?: string | null;
    createdAt: Date;
  };
};

export function mapAccountLinkHistoryToExcelRows(items: AccountLinkExportItem[]) {
  return items.map(item => [
    item.employeeName,
    item.employeeCode,
    item.log.action === "linked" ? "ربط حساب" : "فك ربط حساب",
    accountLinkSourceLabels[item.log.source] ?? item.log.source,
    item.accountName || item.accountEmail || (item.log.userId ? `حساب #${item.log.userId}` : "—"),
    item.accountEmail ?? "—",
    item.log.actorName || "النظام",
    item.log.createdAt,
  ]);
}

type EmployeeAuditExportItem = {
  action: string;
  actorName?: string | null;
  createdAt: Date;
  changes: unknown;
};

export function mapEmployeeAuditToExcelRows(employeeName: string, employeeCode: string, items: EmployeeAuditExportItem[]) {
  return items.flatMap(item => {
    const changes = Array.isArray(item.changes) ? item.changes as Array<{ label?: string; before?: string | null; after?: string | null }> : [];
    const action = { created: "إنشاء الملف", updated: "تعديل البيانات", archived: "أرشفة الملف", restored: "استعادة الملف" }[item.action] ?? item.action;
    const base = [employeeName, employeeCode, action, item.actorName || "مستخدم النظام", item.createdAt];
    return changes.length ? changes.map(change => [...base, change.label || "حقل", change.before || "—", change.after || "—"]) : [[...base, "—", "—", "—"]];
  });
}

type AttendanceReportExportItem = {
  employeeCode: string;
  fullName: string;
  expectedDays: number;
  summary: {
    presentDays: number;
    absentDays: number;
    totalLateMinutes: number;
    earlyLeaveMinutes: number;
    overtimeMinutes: number;
    attendanceRate: number;
    punctualityRate: number;
    hoursRate: number;
    complianceScore: number;
  };
};

export function mapAttendanceReportToExcelRows(items: AttendanceReportExportItem[]) {
  return items.map(item => [item.fullName, item.employeeCode, item.expectedDays, item.summary.presentDays, item.summary.absentDays, item.summary.totalLateMinutes, item.summary.earlyLeaveMinutes, item.summary.overtimeMinutes, `${item.summary.attendanceRate.toFixed(1)}%`, `${item.summary.punctualityRate.toFixed(1)}%`, `${item.summary.hoursRate.toFixed(1)}%`, `${item.summary.complianceScore.toFixed(1)}%`]);
}

type PayrollAdjustmentExportItem = {
  employeeName: string;
  employeeCode: string;
  ruleName?: string | null;
  adjustment: { adjustmentType: "reward" | "penalty"; source: "automatic_rule" | "manual"; status: "pending" | "approved" | "rejected" | "applied"; amount: string | number; metricValue: number; occurrenceDate?: Date | null; description: string; createdAt: Date };
};

export function mapPayrollAdjustmentsToExcelRows(items: PayrollAdjustmentExportItem[]) {
  return items.map(item => [item.employeeName, item.employeeCode, item.adjustment.adjustmentType === "reward" ? "مكافأة" : "جزاء / خصم", item.adjustment.source === "automatic_rule" ? "قاعدة تلقائية" : "إدخال يدوي", item.ruleName || "—", item.adjustment.metricValue, item.adjustment.amount, { pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", applied: "مُدرج في مسير" }[item.adjustment.status], item.adjustment.occurrenceDate ?? "—", item.adjustment.description, item.adjustment.createdAt]);
}
