import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

const ModulePage = lazy(() => import("./pages/ModulePage"));
const ArchivedEmployees = lazy(() => import("./pages/ArchivedEmployees"));
const EmployeeAuditLog = lazy(() => import("./pages/EmployeeAuditLog"));

function ProtectedModule({ module }: { module: "employees" | "attendance" | "shifts" | "leaves" | "kpis" | "payroll" }) {
  return <DashboardLayout><Suspense fallback={<div className="grid min-h-72 place-items-center text-sm font-bold text-[#0f766e]">جارٍ تحميل مساحة العمل…</div>}><ModulePage module={module} /></Suspense></DashboardLayout>;
}

function Router() {
  return <Switch><Route path="/" component={Home} /><Route path="/employees">{() => <ProtectedModule module="employees" />}</Route><Route path="/archived-employees">{() => <DashboardLayout><Suspense fallback={<div className="grid min-h-72 place-items-center text-sm font-bold text-[#0f766e]">جارٍ تحميل الأرشيف…</div>}><ArchivedEmployees /></Suspense></DashboardLayout>}</Route><Route path="/employee-audit-log">{() => <DashboardLayout><Suspense fallback={<div className="grid min-h-72 place-items-center text-sm font-bold text-[#0f766e]">جارٍ تحميل سجل التعديلات…</div>}><EmployeeAuditLog /></Suspense></DashboardLayout>}</Route><Route path="/attendance">{() => <ProtectedModule module="attendance" />}</Route><Route path="/shifts">{() => <ProtectedModule module="shifts" />}</Route><Route path="/leaves">{() => <ProtectedModule module="leaves" />}</Route><Route path="/kpis">{() => <ProtectedModule module="kpis" />}</Route><Route path="/payroll">{() => <ProtectedModule module="payroll" />}</Route><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster position="top-center" richColors /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
