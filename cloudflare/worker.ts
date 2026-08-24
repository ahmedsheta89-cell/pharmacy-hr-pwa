/**
 * Pharmacy People — Cloudflare staging entry point.
 *
 * This deliberately exposes only a health endpoint until the legacy Express
 * contracts and Supabase RLS policies have been ported and reviewed.
 */
export interface Env {
  ENVIRONMENT?: string;
}

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json(
        {
          status: "ok",
          service: "pharmacy-people-staging-api",
          environment: env.ENVIRONMENT ?? "staging",
          timestamp: new Date().toISOString(),
        },
        { headers: jsonHeaders },
      );
    }

    return Response.json(
      {
        error: "not_found",
        message: "Staging API is intentionally limited during migration.",
      },
      { status: 404, headers: jsonHeaders },
    );
  },
};
