const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 160;

export type StartupDiagnosticCode =
  | "BOOTSTRAP_MODULE_LOAD"
  | "BOOTSTRAP_SYNTAX"
  | "PERFORMANCE_API"
  | "FETCH_API"
  | "BOOTSTRAP_RUNTIME";

export type StartupDiagnostic = {
  code: StartupDiagnosticCode;
  name: string;
  message: string;
};

function safeMessage(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
}

export function createStartupDiagnostic(error: unknown): StartupDiagnostic {
  const name = error instanceof Error && error.name ? error.name : "UnknownError";
  const message = safeMessage(error instanceof Error ? error.message : error);
  const normalized = message.toLowerCase();

  let code: StartupDiagnosticCode = "BOOTSTRAP_RUNTIME";
  if (normalized.includes("dynamically imported module")) code = "BOOTSTRAP_MODULE_LOAD";
  else if (name === "SyntaxError") code = "BOOTSTRAP_SYNTAX";
  else if (normalized.includes("performance") || normalized.includes("now is not a function")) code = "PERFORMANCE_API";
  else if (normalized.includes("fetch") || normalized.includes("network")) code = "FETCH_API";

  return { code, name: safeMessage(name).slice(0, 64), message };
}
