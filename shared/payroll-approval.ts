export type PayrollApprovalDecision = "approved" | "rejected" | "returned";
export type PayrollApprovalStage = "manager" | "hr_manager";

export function getNextPayrollStatus(stage: PayrollApprovalStage, decision: PayrollApprovalDecision) {
  if (stage === "manager") {
    if (decision === "approved") return "pending_hr" as const;
    return decision === "rejected" ? "rejected" as const : "draft" as const;
  }
  if (decision === "approved") return "approved" as const;
  return decision === "rejected" ? "rejected" as const : "draft" as const;
}
