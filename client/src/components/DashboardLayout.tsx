import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import {
  BarChart3,
  ArchiveRestore,
  Bell,
  CalendarDays,
  ChevronLeft,
  Clock3,
  LayoutDashboard,
  History,
  LogOut,
  Pill,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

type AppRole = "owner" | "manager" | "hr_manager" | "pharmacist" | "employee";

export const allNavigation = [
  { icon: LayoutDashboard, label: "نظرة عامة", path: "/", roles: ["owner", "manager", "pharmacist", "employee"] as AppRole[] },
  { icon: UsersRound, label: "الموظفون", path: "/employees", roles: ["owner", "manager"] as AppRole[] },
  { icon: ArchiveRestore, label: "الموظفون المؤرشفون", path: "/archived-employees", roles: ["owner", "manager"] as AppRole[] },
  { icon: History, label: "سجل التعديلات", path: "/employee-audit-log", roles: ["owner", "manager"] as AppRole[] },
  { icon: Clock3, label: "الحضور والانصراف", path: "/attendance", roles: ["owner", "manager", "pharmacist", "employee"] as AppRole[] },
  { icon: CalendarDays, label: "الورديات", path: "/shifts", roles: ["owner", "manager", "pharmacist", "employee"] as AppRole[] },
  { icon: ReceiptText, label: "الإجازات", path: "/leaves", roles: ["owner", "manager", "pharmacist", "employee"] as AppRole[] },
  { icon: BarChart3, label: "مؤشرات الأداء", path: "/kpis", roles: ["owner", "manager", "pharmacist", "employee"] as AppRole[] },
  { icon: WalletCards, label: "الرواتب", path: "/payroll", roles: ["owner", "manager", "hr_manager"] as AppRole[] },
];

const roleLabels: Record<AppRole, string> = {
  owner: "مالك النظام",
  manager: "مدير الفرع",
  hr_manager: "مدير الموارد البشرية",
  pharmacist: "صيدلاني",
  employee: "موظف",
};

export function normalizeLayoutRole(role?: string): AppRole {
  if (role === "admin" || role === "owner") return "owner";
  if (role === "manager" || role === "hr_manager" || role === "pharmacist") return role;
  return "employee";
}

export function getNavigationForRole(role?: string) {
  const normalizedRole = normalizeLayoutRole(role);
  return allNavigation.filter(item => item.roles.includes(normalizedRole));
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const notificationsQuery = trpc.notifications.mine.useQuery(undefined, { enabled: Boolean(user) && !loading });
  const markNotificationRead = trpc.notifications.markRead.useMutation({ onSuccess: () => notificationsQuery.refetch() });

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#f4f7f5] px-5 py-10 flex items-center justify-center">
        <div className="w-full max-w-md rounded-[2rem] border border-[#dce9e2] bg-white p-8 text-center shadow-[0_24px_64px_-36px_rgba(15,118,110,.48)]">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#0f766e] text-white shadow-lg shadow-[#0f766e]/20">
            <Pill className="h-8 w-8" />
          </div>
          <Badge className="mb-4 border-0 bg-[#e6f5ef] text-[#0f766e] hover:bg-[#e6f5ef]">نظام آمن ومخصص لفريق الصيدلية</Badge>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#17344a]">سجّل الدخول للمتابعة</h1>
          <p className="mt-3 leading-7 text-sm text-slate-500">تحتاج إلى حساب مُصرّح به للوصول إلى بيانات الموظفين والرواتب والأداء.</p>
          <Button onClick={() => startLogin()} className="mt-8 h-12 w-full rounded-2xl bg-[#0f766e] text-base font-bold hover:bg-[#0b5c56]">تسجيل الدخول الآمن</Button>
        </div>
      </div>
    );
  }

  const role = normalizeLayoutRole(user.role);
  const navigation = getNavigationForRole(user.role);
  const activeItem = navigation.find(item => item.path === location) ?? navigation[0];
  const initials = user.name?.trim().slice(0, 2).toUpperCase() || "PH";
  const unreadNotifications = (notificationsQuery.data ?? []).filter(notification => !notification.readAt).length;

  return (
    <div dir="rtl" className="min-h-screen bg-[#f4f7f5] text-[#17344a]">
      <SidebarProvider defaultOpen>
        <Sidebar side="right" collapsible="icon" className="border-l border-[#dbe9e2] border-r-0 bg-[#fbfdfc]">
          <SidebarHeader className="px-4 pt-5 pb-5">
            <button onClick={() => setLocation("/")} className="flex w-full items-center gap-3 rounded-2xl px-2 text-right outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#0f766e] text-white shadow-lg shadow-[#0f766e]/20">
                <Pill className="h-5 w-5" />
              </div>
              <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-base font-extrabold leading-none tracking-tight">نِظام</p>
                <p className="mt-1.5 text-[11px] font-semibold tracking-[.16em] text-[#0f766e]">PHARMACY PEOPLE</p>
              </div>
            </button>
          </SidebarHeader>

          <SidebarContent className="px-3">
            <div className="mb-3 px-3 text-[10px] font-bold tracking-[.18em] text-slate-400 group-data-[collapsible=icon]:hidden">مساحة العمل</div>
            <SidebarMenu className="gap-1">
              {navigation.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      onClick={() => setLocation(item.path)}
                      className={`h-11 rounded-xl px-3 text-sm font-semibold transition-all ${isActive ? "bg-[#0f766e] text-white hover:bg-[#0f766e] hover:text-white" : "text-slate-500 hover:bg-[#eaf4ef] hover:text-[#0f766e]"}`}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            <div className="mx-2 mt-8 rounded-2xl bg-[#17344a] p-4 text-white group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-[#9ee4c9]"><Sparkles className="h-4 w-4" /><span className="text-xs font-bold">مساحة منظمة</span></div>
              <p className="mt-2 text-xs leading-5 text-slate-300">كل بيانات فريقك وعملياتك في لوحة واحدة آمنة.</p>
            </div>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-2xl border border-[#e1ece6] bg-white p-2.5 text-right outline-none transition hover:border-[#b9d8ca] focus-visible:ring-2 focus-visible:ring-[#0f766e]">
                  <Avatar className="h-9 w-9 border border-[#cde1d7]">
                    <AvatarFallback className="bg-[#e6f5ef] text-xs font-extrabold text-[#0f766e]">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-bold text-[#17344a]">{user.name || "حساب الصيدلية"}</p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">{roleLabels[role]}</p>
                  </div>
                  <ChevronLeft className="h-4 w-4 text-slate-400 group-data-[collapsible=icon]:hidden" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 rounded-xl">
                <DropdownMenuLabel className="text-right text-xs text-slate-500">الحساب والإعدادات</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="cursor-pointer gap-2 text-destructive focus:text-destructive"><LogOut className="h-4 w-4" />تسجيل الخروج</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-w-0 overflow-x-hidden bg-[#f4f7f5]">
          <header className="sticky top-0 z-20 flex h-[74px] min-w-0 items-center justify-between border-b border-[#e1ece6] bg-[#f4f7f5]/90 px-4 backdrop-blur-xl md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger className="h-10 w-10 rounded-xl border border-[#dbe9e2] bg-white text-[#17344a] hover:bg-[#eaf4ef]" />
              <div>
                <p className="text-[11px] font-bold tracking-[.12em] text-[#0f766e]">{roleLabels[role]}</p>
                <h1 className="text-lg font-extrabold tracking-tight text-[#17344a]">{activeItem?.label || "نظام الصيدلية"}</h1>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label="الإشعارات" className="relative grid h-9 w-9 place-items-center rounded-full border border-[#dbe9e2] bg-white text-[#17344a] transition hover:bg-[#eaf4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e]">
                    <Bell className="h-4 w-4" />
                    {unreadNotifications ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#e25555] px-1 text-[9px] font-extrabold text-white">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span> : null}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2 text-right">
                  <DropdownMenuLabel className="flex items-center justify-between px-2 text-right text-xs text-slate-500"><span>الإشعارات</span><span>{unreadNotifications ? `${unreadNotifications} غير مقروء` : "محدّثة"}</span></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(notificationsQuery.data ?? []).length ? notificationsQuery.data?.map(notification => <DropdownMenuItem key={notification.id} onClick={() => { if (!notification.readAt) markNotificationRead.mutate({ notificationId: notification.id }); }} className={`block cursor-pointer rounded-xl px-3 py-3 whitespace-normal focus:bg-[#eaf4ef] ${notification.readAt ? "opacity-60" : "bg-[#f7fcf9]"}`}><p className="font-bold text-[#17344a]">{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{notification.body}</p></DropdownMenuItem>) : <p className="px-3 py-5 text-center text-xs text-slate-500">لا توجد إشعارات جديدة.</p>}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex h-9 items-center gap-2 rounded-full border border-[#dbe9e2] bg-white px-3 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-[#0f766e]" />بيانات محمية</div>
              <div className="h-9 rounded-full bg-[#e6f5ef] px-3.5 flex items-center text-xs font-bold text-[#0f766e]">اليوم</div>
            </div>
          </header>
          <main className="mx-auto w-full min-w-0 max-w-[1600px] overflow-x-hidden p-4 md:p-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
