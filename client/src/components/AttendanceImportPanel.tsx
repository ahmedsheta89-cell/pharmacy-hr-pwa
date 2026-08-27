import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { downloadAttendanceImportTemplate, exportAttendanceImportErrorRows, getAttendanceImportRowEdit, issueLabel, reviseAttendanceImportRow, type AttendanceImportDraft, type AttendanceImportProgress, type AttendanceImportRowEdit } from "@/lib/attendance-import";
import { CheckCircle2, FileDown, FileSpreadsheet, Loader2, ShieldCheck, TriangleAlert, Upload, XCircle } from "lucide-react";
import React, { useState, type ChangeEvent, type DragEvent } from "react";

type AttendanceImportPanelProps = {
  activeBranchId: number;
  draft: AttendanceImportDraft | null;
  error: string | null;
  progress: AttendanceImportProgress | null;
  applying: boolean;
  onSelectFile: (file?: File) => void;
  onUpdateDraft: (draft: AttendanceImportDraft) => void;
  onApply: () => void;
};

function formatDate(value?: Date) {
  return value ? new Intl.DateTimeFormat("ar-EG", { year: "numeric", month: "short", day: "numeric" }).format(value) : "—";
}

function formatTime(value?: Date) {
  return value ? new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(value) : "—";
}

export function AttendanceImportPanel({ activeBranchId, draft, error, progress, applying, onSelectFile, onUpdateDraft, onApply }: AttendanceImportPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const validRows = draft?.rows.filter(row => !row.issues.length) ?? [];
  const invalidRows = draft?.rows.filter(row => row.issues.length > 0) ?? [];
  const isReading = progress?.phase === "reading" || progress?.phase === "validating";

  const editRow = (rowNumber: number, patch: Partial<AttendanceImportRowEdit>) => {
    if (!draft) return;
    const nextRows = draft.rows.map(row => row.rowNumber === rowNumber ? reviseAttendanceImportRow(row, { ...getAttendanceImportRowEdit(row), ...patch }) : row);
    onUpdateDraft({ ...draft, rows: nextRows });
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    onSelectFile(file);
  };

  const dropFile = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    onSelectFile(event.dataTransfer.files?.[0]);
  };

  return (
    <Card className="border-[#cce3d8] bg-[#f8fcfa]">
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Upload className="h-5 w-5 text-[#0f766e]" /><h3 className="font-extrabold text-[#17344a]">استيراد حضور وانصراف</h3></div>
            <p className="mt-2 text-xs leading-6 text-slate-500">اسحب ملف Excel أو CSV هنا أو اختره من جهازك. تُقرأ البيانات محلياً وتبقى بحاجة إلى اعتماد صريح قبل الحفظ.</p>
          </div>
          <Button size="sm" variant="outline" onClick={downloadAttendanceImportTemplate} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><FileDown className="ml-1 h-3.5 w-3.5" />تحميل قالب فارغ</Button>
        </div>

        <label
          htmlFor="attendance-import-file"
          onDragEnter={event => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={dropFile}
          className={`mt-4 block cursor-pointer rounded-2xl border-2 border-dashed bg-white p-5 text-center transition focus-within:ring-2 focus-within:ring-[#0f766e] ${isDragging ? "border-[#0f766e] bg-[#eaf8f1]" : "border-[#99caba] hover:bg-[#f3fbf7]"}`}
        >
          <input id="attendance-import-file" type="file" accept=".xlsx,.csv" className="sr-only" onChange={chooseFile} />
          {isReading ? <Loader2 className="mx-auto h-6 w-6 text-[#0f766e] motion-safe:animate-spin" /> : <FileSpreadsheet className="mx-auto h-6 w-6 text-[#0f766e]" />}
          <p className="mt-2 text-sm font-bold text-[#17344a]">{isDragging ? "أفلت الملف لبدء القراءة" : "اسحب الملف هنا أو اختر ملف الحضور والانصراف"}</p>
          <p className="mt-1 text-xs text-slate-500">`.xlsx` أو `.csv` حتى 5 ميجابايت. الحقول القياسية: كود الموظف، تاريخ العمل، وقت الحضور والانصراف.</p>
        </label>

        {progress ? <div className={`mt-4 rounded-2xl border p-4 ${progress.phase === "error" ? "border-red-200 bg-red-50" : progress.phase === "ready" ? "border-[#b9d8ca] bg-[#eef8f4]" : "border-[#b9d8ca] bg-white"}`} role="status" aria-live="polite">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#17344a]"><span>{progress.message}</span><span>{progress.value}٪</span></div>
          <div role="progressbar" aria-label="تقدم قراءة ملف الحضور" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.value} aria-valuetext={progress.message} className="mt-3 h-2 overflow-hidden rounded-full bg-[#dceee6]"><div className={`h-full rounded-full transition-[width] duration-300 ${progress.phase === "error" ? "bg-red-500" : progress.phase === "ready" ? "bg-[#0f766e]" : "bg-[#0f766e] motion-safe:animate-pulse"}`} style={{ width: `${progress.value}%` }} /></div>
        </div> : null}

        {error ? <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><XCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}

        {draft ? <div className="mt-4 rounded-2xl border border-[#d7e6df] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-[#17344a]">معاينة: {draft.sourceFileName}</p><p className="mt-1 text-xs text-slate-500">يمكنك تعديل الحقول الحمراء مباشرة؛ تعاد المراجعة فوراً قبل الاعتماد.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!invalidRows.length} onClick={() => exportAttendanceImportErrorRows(draft.sourceFileName, draft.rows)} className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"><FileDown className="ml-1 h-3.5 w-3.5" />تصدير صفوف المراجعة</Button><Button size="sm" disabled={!activeBranchId || !validRows.length || applying} onClick={onApply} className="bg-[#0f766e] hover:bg-[#0b5c56]">{applying ? <Loader2 className="ml-1 h-4 w-4 motion-safe:animate-spin" /> : <ShieldCheck className="ml-1 h-4 w-4" />}اعتماد الصفوف السليمة</Button></div></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="ملخص صفوف المعاينة"><SummaryCard label="إجمالي الصفوف" value={draft.rows.length} tone="neutral" /><SummaryCard label="جاهزة للاعتماد" value={validRows.length} tone="good" /><SummaryCard label="تحتاج مراجعة" value={invalidRows.length} tone="alert" /></div>
          {draft.issues.length ? <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{draft.issues.join(" ")}</div> : null}
          <div className="mt-4 max-h-96 overflow-auto rounded-xl border border-[#edf3ef]"><table className="w-full min-w-[920px] text-right text-xs"><thead className="sticky top-0 bg-[#f4faf7] text-[#47645a]"><tr><th className="p-2">صف</th><th className="p-2">الكود</th><th className="p-2">التاريخ</th><th className="p-2">الحضور</th><th className="p-2">الانصراف</th><th className="p-2">الحالة</th><th className="p-2">حالة المراجعة</th></tr></thead><tbody>{draft.rows.slice(0, 50).map(row => {
            const hasIssues = row.issues.length > 0;
            const edit = getAttendanceImportRowEdit(row);
            return <tr key={row.rowNumber} className={hasIssues ? "border-t-2 border-red-200 bg-red-50 text-red-900" : "border-t border-[#edf3ef] bg-white text-[#17344a]"}><td className="p-2 font-bold">{row.rowNumber}</td><td className="p-2">{hasIssues ? <Input aria-label={`كود الموظف في الصف ${row.rowNumber}`} value={edit.employeeCode} onChange={event => editRow(row.rowNumber, { employeeCode: event.target.value })} className="h-8 min-w-28 border-red-200 bg-white text-xs" /> : row.employeeCode || "—"}</td><td className="p-2">{hasIssues ? <Input aria-label={`تاريخ العمل في الصف ${row.rowNumber}`} type="date" value={edit.workDate} onChange={event => editRow(row.rowNumber, { workDate: event.target.value })} className="h-8 min-w-36 border-red-200 bg-white text-xs" /> : formatDate(row.workDate)}</td><td className="p-2">{hasIssues ? <Input aria-label={`وقت الحضور في الصف ${row.rowNumber}`} type="time" value={edit.checkInTime} onChange={event => editRow(row.rowNumber, { checkInTime: event.target.value })} className="h-8 min-w-28 border-red-200 bg-white text-xs" /> : formatTime(row.checkInAt)}</td><td className="p-2">{hasIssues ? <Input aria-label={`وقت الانصراف في الصف ${row.rowNumber}`} type="time" value={edit.checkOutTime} onChange={event => editRow(row.rowNumber, { checkOutTime: event.target.value })} className="h-8 min-w-28 border-red-200 bg-white text-xs" /> : formatTime(row.checkOutAt)}</td><td className="p-2">{hasIssues ? <select aria-label={`حالة الحضور في الصف ${row.rowNumber}`} value={edit.status} onChange={event => editRow(row.rowNumber, { status: event.target.value as AttendanceImportRowEdit["status"] })} className="h-8 min-w-24 rounded-md border border-red-200 bg-white px-2 text-xs"><option value="present">حاضر</option><option value="absent">غائب</option><option value="excused">بعذر</option></select> : { present: "حاضر", absent: "غائب", excused: "بعذر" }[row.status ?? "present"]}</td><td className="p-2">{hasIssues ? <Badge variant="outline" className="border-red-300 bg-red-100 text-red-800 hover:bg-red-100"><TriangleAlert className="ml-1 h-3 w-3" />{row.issues.map(issueLabel).join("، ")}</Badge> : <Badge className="border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]"><CheckCircle2 className="ml-1 h-3 w-3" />سليم مبدئياً</Badge>}</td></tr>;
          })}</tbody></table></div>
          {draft.rows.length > 50 ? <p className="mt-2 text-xs text-slate-500">تظهر أول 50 صفاً من المعاينة؛ يضم التصدير جميع صفوف المراجعة، ولا يُعتمد إلا الصف السليم بعد تحقق الخادم النهائي.</p> : null}
        </div> : null}
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "good" | "alert" }) {
  const colors = tone === "good" ? "border-[#b9d8ca] bg-[#eef8f4] text-[#0f766e]" : tone === "alert" ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-[#17344a]";
  return <div className={`rounded-xl border p-3 ${colors}`}><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-2xl font-extrabold" aria-label={`${label}: ${value}`}>{value}</p></div>;
}
