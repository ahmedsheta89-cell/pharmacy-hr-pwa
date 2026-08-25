import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

type StartupDiagnosticRecord = { code: string; name: string; message: string; expiresAt: number };
const startupDiagnostics = new Map<string, StartupDiagnosticRecord>();
const DIAGNOSTIC_TTL_MS = 10 * 60 * 1000;

function cleanStartupDiagnostic(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").slice(0, maxLength) : "";
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/startup-diagnostic", (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    const code = typeof body?.code === "string" && /^[A-Z_]{3,64}$/.test(body.code) ? body.code : "BOOTSTRAP_RUNTIME";
    const name = cleanStartupDiagnostic(body?.name, 64) || "UnknownError";
    const message = cleanStartupDiagnostic(body?.message, 160);
    const incidentId = typeof body?.incidentId === "string" && /^[a-z0-9]{12,64}$/i.test(body.incidentId) ? body.incidentId : undefined;
    if (incidentId) {
      startupDiagnostics.set(incidentId, { code, name, message, expiresAt: Date.now() + DIAGNOSTIC_TTL_MS });
      for (const id of Array.from(startupDiagnostics.keys())) {
        if ((startupDiagnostics.get(id)?.expiresAt ?? 0) <= Date.now()) startupDiagnostics.delete(id);
      }
    }
    console.error("[Client Startup Diagnostic]", JSON.stringify({ code, name, message }));
    res.status(204).end();
  });
  app.get("/api/startup-diagnostic/:incidentId", (req, res) => {
    const incidentId = req.params.incidentId;
    const record = startupDiagnostics.get(incidentId);
    if (!record || record.expiresAt <= Date.now()) {
      startupDiagnostics.delete(incidentId);
      res.status(404).json({ found: false });
      return;
    }
    res.json({ found: true, code: record.code, name: record.name, message: record.message });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
