import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("Quality Gate workflow resilience", () => {
  it("preserves automatic protection and permits a reasoned manual recheck", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("reason:");
    expect(workflow).toContain("recovery_after_provider_incident");
    expect(workflow).toContain("reviewer_requested_recheck");
  });

  it("serializes equivalent runs and rejects manual validation on main", () => {
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("Manual run guard");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("must target a pull-request branch, not main");
  });

  it("retains the least-privilege permission model", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("pull-requests: write");
    expect(workflow).not.toContain("contents: write");
  });

  it("keeps the required quality-gate job and only runs after its guard", () => {
    expect(workflow).toContain("name: Typecheck, test, build, and production audit");
    expect(workflow).toContain("needs: manual-run-guard");
    expect(workflow).toContain("needs.manual-run-guard.result == 'success'");
    expect(workflow).toContain("needs.manual-run-guard.result == 'skipped'");
  });
});
