import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import QRCode from "qrcode";
import { Camera, Copy, QrCode, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Action = "check_in" | "check_out";

export function AttendanceQrPanel({ branchId, canIssue, afterSuccess }: { branchId: number; canIssue: boolean; afterSuccess: () => void }) {
  const [token, setToken] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [issued, setIssued] = useState<{ action: Action; image: string; expiresAt: Date } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const issueQr = trpc.attendance.issueQr.useMutation({
    onSuccess: async (data, input) => {
      const image = await QRCode.toDataURL(data.token, { width: 280, margin: 1, color: { dark: "#17344a", light: "#ffffff" } });
      setIssued({ action: input.action, image, expiresAt: data.expiresAt });
      setToken(data.token);
      toast.success("تم إصدار رمز QR صالح لمدة عشر دقائق.");
    },
    onError: error => toast.error(error.message),
  });
  const checkIn = trpc.attendance.checkInByQr.useMutation({ onSuccess: data => { toast.success(data.lateMinutes ? `تم تسجيل الحضور مع تأخير ${data.lateMinutes} دقيقة.` : "تم تسجيل الحضور بنجاح."); setToken(""); afterSuccess(); }, onError: error => toast.error(error.message) });
  const checkOut = trpc.attendance.checkOutByQr.useMutation({ onSuccess: data => { toast.success(`تم تسجيل الانصراف: ${Math.floor(data.workedMinutes / 60)} س ${data.workedMinutes % 60} د.`); setToken(""); afterSuccess(); }, onError: error => toast.error(error.message) });

  useEffect(() => {
    if (!scannerOpen) return;
    let scanner: { start: () => Promise<void>; destroy: () => void } | undefined;
    void import("qr-scanner").then(({ default: QrScanner }) => {
      if (!videoRef.current) return;
      scanner = new QrScanner(videoRef.current, result => { setToken(result.data); setScannerOpen(false); toast.success("تمت قراءة الرمز، اختر نوع الحركة للتأكيد."); }, { returnDetailedScanResult: true, highlightScanRegion: true });
      void scanner.start().catch(() => { toast.error("تعذر تشغيل الكاميرا. اسمح بالوصول أو ألصق الرمز يدوياً."); setScannerOpen(false); });
    });
    return () => scanner?.destroy();
  }, [scannerOpen]);

  const submit = (action: Action) => {
    if (!token.trim()) return toast.error("امسح رمز QR أو ألصقه أولاً.");
    action === "check_in" ? checkIn.mutate({ token: token.trim() }) : checkOut.mutate({ token: token.trim() });
  };
  const pending = checkIn.isPending || checkOut.isPending;
  return <div className="mt-6 rounded-2xl border border-[#cce3d8] bg-[#f8fcfa] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-[#17344a]">تأكيد الحركة عبر QR</p><p className="mt-1 text-xs leading-5 text-slate-500">تُقبل الرموز الموقعة للفرع نفسه فقط وتنتهي خلال 10 دقائق. لا تُخزّن بيانات الموظف داخل الرمز.</p></div><Button type="button" variant="outline" onClick={() => setScannerOpen(value => !value)} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]"><Camera className="ml-2 h-4 w-4" />{scannerOpen ? "إغلاق الكاميرا" : "مسح بالكاميرا"}</Button></div>{scannerOpen ? <video ref={videoRef} className="mt-4 aspect-video w-full max-w-md rounded-xl bg-[#17344a] object-cover" /> : null}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]"><div><Label htmlFor="attendance-token" className="text-xs font-bold text-slate-600">رمز QR المقروء</Label><Input id="attendance-token" value={token} onChange={event => setToken(event.target.value)} placeholder="امسح الرمز أو ألصقه هنا" className="mt-1 rounded-xl border-[#d7e6df] bg-white" /></div><Button type="button" disabled={pending} onClick={() => submit("check_in")} className="self-end rounded-xl bg-[#0f766e] font-bold hover:bg-[#0b5c56]"><ScanLine className="ml-2 h-4 w-4" />حضور</Button><Button type="button" disabled={pending} onClick={() => submit("check_out")} variant="outline" className="self-end rounded-xl border-[#b9d8ca] font-bold text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]">انصراف</Button></div>{canIssue ? <div className="mt-5 border-t border-[#dce9e2] pt-5"><p className="text-xs font-extrabold text-[#17344a]">محطة الفرع: إصدار رمز للفريق</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={!branchId || issueQr.isPending} onClick={() => issueQr.mutate({ branchId, action: "check_in" })}><QrCode className="ml-2 h-4 w-4" />رمز حضور</Button><Button type="button" size="sm" variant="outline" disabled={!branchId || issueQr.isPending} onClick={() => issueQr.mutate({ branchId, action: "check_out" })} className="border-[#b9d8ca] text-[#0f766e] hover:bg-[#eaf4ef] hover:text-[#0f766e]">رمز انصراف</Button></div>{issued ? <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-white p-4"><img src={issued.image} width="140" height="140" alt={`رمز ${issued.action === "check_in" ? "حضور" : "انصراف"} للفرع`} /><div className="max-w-sm"><p className="text-sm font-bold text-[#17344a]">رمز {issued.action === "check_in" ? "الحضور" : "الانصراف"}</p><p className="mt-1 text-xs text-slate-500">ينتهي في {new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit" }).format(issued.expiresAt)}. اعرضه على شاشة محطة الفرع فقط.</p><Button type="button" size="sm" variant="ghost" className="mt-2 h-8 text-[#0f766e]" onClick={() => { void navigator.clipboard?.writeText(token); toast.success("تم نسخ الرمز."); }}><Copy className="ml-1 h-3.5 w-3.5" />نسخ الرمز</Button></div></div> : null}</div> : null}</div>;
}
