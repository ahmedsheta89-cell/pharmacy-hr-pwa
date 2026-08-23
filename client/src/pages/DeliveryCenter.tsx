import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Clock3, ImageIcon, MapPinned, TrendingUp, Upload } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { DeliveryRouteMap } from "@/components/DeliveryRouteMap";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const statusLabel: Record<string, string> = { draft: "مسودة", ready: "جاهز", assigned: "مسند", picked_up: "تم الاستلام", en_route: "في الطريق", delivered: "تم التسليم", failed: "تعذر التسليم", returned: "عاد للفرع", cancelled: "ملغي" };
const terminalStatuses = ["delivered", "failed", "returned", "cancelled"];
const canManage = (role?: string) => ["admin", "owner", "manager"].includes(role ?? "");

function formatDate(value?: Date | null) {
  return value ? new Date(value).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

function encodeFile(file: File) {
  return file.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  });
}

export default function DeliveryCenter() {
  const { user } = useAuth();
  const manager = canManage(user?.role);
  const profile = trpc.profile.mine.useQuery();
  const branchId = profile.data?.employee?.branchId ?? 0;
  const managerEnabled = manager && Boolean(branchId);
  const utils = trpc.useUtils();
  const orders = trpc.delivery.list.useQuery({ branchId }, { enabled: managerEnabled });
  const mine = trpc.delivery.mine.useQuery(undefined, { enabled: !manager });
  const summary = trpc.delivery.summary.useQuery({ branchId }, { enabled: managerEnabled, refetchInterval: 30_000 });
  const liveRoutes = trpc.delivery.liveRoutes.useQuery({ branchId }, { enabled: managerEnabled, refetchInterval: 30_000 });
  const zones = trpc.delivery.zones.useQuery({ branchId }, { enabled: managerEnabled });
  const alerts = trpc.delivery.slaAlerts.useQuery({ branchId }, { enabled: managerEnabled, refetchInterval: 30_000 });
  const weekly = trpc.delivery.weeklyReport.useQuery({ branchId }, { enabled: managerEnabled });
  const team = trpc.employees.list.useQuery({ branchId }, { enabled: managerEnabled });
  const [form, setForm] = useState({ orderCode: "", customerName: "", customerPhone: "", address: "", promisedAt: "", deliveryZoneId: "" });
  const [zoneForm, setZoneForm] = useState({ name: "", code: "", description: "", slaMinutes: 60 });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [proofOrderId, setProofOrderId] = useState<number | null>(null);
  const proofs = trpc.delivery.proofs.useQuery({ orderId: proofOrderId ?? 0 }, { enabled: Boolean(proofOrderId) });
  const displayed = manager ? orders.data ?? [] : (mine.data ?? []).map(order => ({ order, agentName: "" }));
  const active = useMemo(() => displayed.find(item => item.order.status === "en_route")?.order, [displayed]);

  const invalidateManagerData = () => {
    utils.delivery.list.invalidate();
    utils.delivery.summary.invalidate();
    utils.delivery.liveRoutes.invalidate();
    utils.delivery.zones.invalidate();
    utils.delivery.slaAlerts.invalidate();
    utils.delivery.weeklyReport.invalidate();
  };
  const create = trpc.delivery.create.useMutation({ onSuccess: () => { toast.success("تم إنشاء الطلب واحتساب SLA."); setForm({ orderCode: "", customerName: "", customerPhone: "", address: "", promisedAt: "", deliveryZoneId: "" }); invalidateManagerData(); }, onError: error => toast.error(error.message) });
  const assign = trpc.delivery.assign.useMutation({ onSuccess: invalidateManagerData, onError: error => toast.error(error.message) });
  const update = trpc.delivery.updateStatus.useMutation({ onSuccess: () => { utils.delivery.mine.invalidate(); invalidateManagerData(); toast.success("تم تحديث حالة الرحلة."); }, onError: error => toast.error(error.message) });
  const saveZone = trpc.delivery.saveZone.useMutation({ onSuccess: () => { toast.success("تم حفظ منطقة التوصيل."); setZoneForm({ name: "", code: "", description: "", slaMinutes: 60 }); utils.delivery.zones.invalidate(); }, onError: error => toast.error(error.message) });
  const uploadProof = trpc.delivery.uploadProof.useMutation({ onSuccess: () => { toast.success("تم حفظ إثبات التسليم بأمان."); utils.delivery.proofs.invalidate(); utils.delivery.weeklyReport.invalidate(); }, onError: error => toast.error(error.message) });
  const ping = trpc.delivery.pingLocation.useMutation();

  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(position => ping.mutate({ orderId: active.id, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: Math.round(position.coords.accuracy) }), () => undefined, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [active?.id]);

  const advance = (orderId: number, status: "picked_up" | "en_route" | "delivered" | "failed" | "returned") => navigator.geolocation?.getCurrentPosition(position => update.mutate({ orderId, status, note: notes[orderId], latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: Math.round(position.coords.accuracy) }), () => update.mutate({ orderId, status, note: notes[orderId] }));
  const handleProof = async (orderId: number, file?: File) => {
    if (!file) return;
    if (!(["image/jpeg", "image/png", "image/webp"] as string[]).includes(file.type)) return toast.error("استخدم JPG أو PNG أو WEBP فقط.");
    if (file.size > 5 * 1024 * 1024) return toast.error("الحد الأقصى لصورة الإثبات هو 5 ميجابايت.");
    try { uploadProof.mutate({ orderId, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await encodeFile(file), caption: notes[orderId] }); } catch { toast.error("تعذر قراءة الصورة."); }
  };

  return <div dir="rtl" className="space-y-6">
    <section className="overflow-hidden rounded-3xl bg-[#17344a] p-6 text-white shadow-xl"><div className="max-w-3xl"><p className="text-xs font-bold tracking-wide text-[#9ee4c9]">التوصيل المنزلي</p><h2 className="mt-1 text-2xl font-extrabold">تحكم واضح في المنطقة والوقت والإثبات</h2><p className="mt-2 text-sm leading-6 text-slate-300">يعمل تحديد الموقع خلال رحلة «في الطريق» فقط. تعرض اللوحة SLA بصورة تشغيلية، وتحفظ إثبات التسليم في التخزين الآمن.</p></div></section>

    {manager ? <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{([{ label: "طلعات اليوم", value: summary.data?.dailyTrips, icon: <MapPinned className="h-4 w-4" /> }, { label: "تم التسليم", value: summary.data?.delivered, icon: <CheckCircle2 className="h-4 w-4" /> }, { label: "متأخر عن SLA", value: summary.data?.delayed, icon: <AlertTriangle className="h-4 w-4" /> }, { label: "رحلات نشطة", value: summary.data?.active, icon: <Clock3 className="h-4 w-4" /> }]).map(item => <article key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-slate-500"><span className="text-xs font-bold">{item.label}</span>{item.icon}</div><p className="mt-2 text-2xl font-extrabold text-[#0f766e]">{item.value ?? "—"}</p></article>)}</section>
      <section className={`rounded-3xl border p-5 ${alerts.data?.length ? "border-amber-200 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}><div className="flex items-center gap-2"><AlertTriangle className={`h-5 w-5 ${alerts.data?.length ? "text-amber-700" : "text-emerald-700"}`} /><h3 className="font-extrabold">تنبيهات اتفاقية مستوى الخدمة</h3></div>{alerts.data?.length ? <div className="mt-3 grid gap-2 md:grid-cols-2">{alerts.data.map(alert => <div key={alert.order.id} className={`rounded-2xl p-3 text-sm ${alert.state === "breached" ? "bg-rose-100 text-rose-900" : "bg-amber-100 text-amber-900"}`}><b>{alert.order.orderCode} · {alert.agentName ?? "لم يُعيّن مندوب"}</b><p className="mt-1">{alert.zoneName ?? "بدون منطقة"} · {alert.minutesRemaining < 0 ? `تم التجاوز بـ ${Math.abs(alert.minutesRemaining)} دقيقة` : `متبقي ${alert.minutesRemaining} دقيقة`}</p></div>)}</div> : <p className="mt-2 text-sm text-emerald-800">لا توجد رحلة قريبة من تجاوز SLA أو متجاوزة حالياً.</p>}</section>
      <DeliveryRouteMap routes={liveRoutes.data ?? []} />
      <section className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[#0f766e]" /><div><h3 className="font-extrabold">تقرير أداء المندوبين الأسبوعي</h3><p className="text-xs text-slate-500">من {formatDate(weekly.data?.weekStart)} إلى {formatDate(weekly.data?.weekEnd)}</p></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-2">المندوب</th><th className="p-2">المسند</th><th className="p-2">المسلّم</th><th className="p-2">في الموعد</th><th className="p-2">إثبات</th><th className="p-2">متوسط الدقيقة</th><th className="p-2">الكفاءة</th></tr></thead><tbody>{(weekly.data?.couriers ?? []).map(row => <tr key={row.employeeId} className="border-b last:border-0"><td className="p-2 font-bold">{row.employeeName}</td><td className="p-2">{row.assigned}</td><td className="p-2">{row.delivered}</td><td className="p-2">{row.onTimeRate}%</td><td className="p-2">{row.proofRate}%</td><td className="p-2">{row.averageDeliveryMinutes ?? "—"}</td><td className="p-2"><Badge className="bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{row.efficiencyScore}%</Badge></td></tr>)}{!weekly.data?.couriers.length ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>لا توجد طلعات مسندة في هذا الأسبوع.</td></tr> : null}</tbody></table></div></section>
      <section className="grid gap-4 lg:grid-cols-2"><form className="grid gap-3 rounded-3xl border bg-white p-5 shadow-sm" onSubmit={event => { event.preventDefault(); create.mutate({ branchId, deliveryZoneId: form.deliveryZoneId ? Number(form.deliveryZoneId) : undefined, orderCode: form.orderCode, customerName: form.customerName, customerPhone: form.customerPhone, address: form.address, promisedAt: form.promisedAt ? new Date(form.promisedAt) : undefined }); }}><h3 className="font-extrabold">طلب توصيل جديد</h3>{[["كود الطلب", "orderCode"], ["اسم العميل", "customerName"], ["هاتف العميل", "customerPhone"], ["العنوان", "address"]].map(([label, key]) => <div key={key}><Label>{label}</Label><Input required value={form[key as keyof typeof form]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></div>)}<div><Label>منطقة التوصيل</Label><select className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm" value={form.deliveryZoneId} onChange={event => setForm({ ...form, deliveryZoneId: event.target.value })}><option value="">بدون منطقة — يتطلب موعد وعد</option>{(zones.data ?? []).filter(zone => zone.isActive === "yes").map(zone => <option key={zone.id} value={zone.id}>{zone.name} · SLA {zone.slaMinutes} دقيقة</option>)}</select></div><div><Label>موعد الوعد (اختياري)</Label><Input type="datetime-local" value={form.promisedAt} onChange={event => setForm({ ...form, promisedAt: event.target.value })} /></div><Button className="bg-[#0f766e]">إنشاء وتجهيز الطلب</Button></form><form className="grid gap-3 rounded-3xl border bg-white p-5 shadow-sm" onSubmit={event => { event.preventDefault(); saveZone.mutate({ branchId, name: zoneForm.name, code: zoneForm.code || undefined, description: zoneForm.description || undefined, slaMinutes: Number(zoneForm.slaMinutes) }); }}><h3 className="font-extrabold">مناطق التوصيل</h3><Input required placeholder="اسم المنطقة" value={zoneForm.name} onChange={event => setZoneForm({ ...zoneForm, name: event.target.value })}/><Input placeholder="رمز اختياري" value={zoneForm.code} onChange={event => setZoneForm({ ...zoneForm, code: event.target.value })}/><Input type="number" min="5" max="1440" value={zoneForm.slaMinutes} onChange={event => setZoneForm({ ...zoneForm, slaMinutes: Number(event.target.value) })}/><Textarea placeholder="تعليمات المنطقة (اختياري)" value={zoneForm.description} onChange={event => setZoneForm({ ...zoneForm, description: event.target.value })}/><Button type="submit">حفظ المنطقة وSLA</Button><div className="space-y-1">{(zones.data ?? []).map(zone => <div key={zone.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs"><b>{zone.name}</b> · {zone.slaMinutes} دقيقة · {zone.isActive === "yes" ? "نشطة" : "مؤرشفة"}</div>)}</div></form></section>
    </> : null}

    <section className="rounded-3xl border bg-white p-5 shadow-sm"><div><h3 className="font-extrabold">{manager ? "طلبات الفرع" : "طلعاتي"}</h3>{!manager ? <p className="mt-1 text-xs leading-5 text-slate-500">يتم التقاط الموقع من جهازك خلال الرحلة النشطة فقط. قد تمنع قيود الهاتف تحديث الموقع عندما يغلق التطبيق.</p> : null}</div><div className="mt-4 space-y-3">{displayed.map(({ order, agentName }) => <article key={order.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{order.orderCode} · {order.customerName}</p><p className="mt-1 text-xs text-slate-500">{order.address}{agentName ? ` · المندوب: ${agentName}` : ""}</p>{order.slaDueAt ? <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />SLA: {formatDate(order.slaDueAt)}</p> : null}</div><Badge className="bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">{statusLabel[order.status]}</Badge></div>{manager && order.status === "ready" ? <div className="mt-3"><select className="h-9 rounded-lg border px-2 text-sm" onChange={event => event.target.value && assign.mutate({ orderId: order.id, employeeId: Number(event.target.value) })}><option value="">تعيين مندوب…</option>{(team.data ?? []).map(member => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select></div> : null}{!manager && !terminalStatuses.includes(order.status) ? <div className="mt-3 flex flex-wrap items-center gap-2"><Input className="max-w-xs" placeholder="ملاحظة أو وصف الإثبات" value={notes[order.id] ?? ""} onChange={event => setNotes({ ...notes, [order.id]: event.target.value })}/>{order.status === "assigned" ? <Button size="sm" onClick={() => advance(order.id, "picked_up")}>استلام الطلب</Button> : null}{order.status === "picked_up" ? <Button size="sm" onClick={() => advance(order.id, "en_route")}>بدء الرحلة</Button> : null}{order.status === "en_route" ? <><label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-xs font-bold"><Camera className="h-4 w-4" />إرفاق صورة<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => handleProof(order.id, event.target.files?.[0])}/></label><Button size="sm" onClick={() => advance(order.id, "delivered")}>تم التسليم</Button><Button size="sm" variant="outline" onClick={() => advance(order.id, "failed")}>تعذر التسليم</Button></> : null}</div> : null}<Button className="mt-3" size="sm" variant="outline" onClick={() => setProofOrderId(order.id)}><ImageIcon className="ml-1 h-4 w-4" />إثباتات التسليم</Button></article>)}{!displayed.length ? <p className="py-8 text-center text-sm text-slate-500">لا توجد طلبات في هذه القائمة.</p> : null}</div></section>
    {proofOrderId ? <section className="rounded-3xl border bg-white p-5"><div className="flex items-center justify-between"><h3 className="font-extrabold">صور إثبات التسليم</h3><Button size="sm" variant="outline" onClick={() => setProofOrderId(null)}>إغلاق</Button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(proofs.data ?? []).map(image => <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border"><img className="h-40 w-full object-cover" src={image.url} alt={image.caption || "صورة إثبات تسليم"}/><p className="p-2 text-xs text-slate-500">{image.caption || "بدون وصف"}</p></a>)}{!proofs.data?.length ? <p className="text-sm text-slate-500">لا توجد صور إثبات لهذا الطلب بعد.</p> : null}</div></section> : null}
  </div>;
}
