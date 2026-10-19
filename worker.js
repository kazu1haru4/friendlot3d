export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors });
    }
    if (url.pathname === "/api/health") {
      let database = "not_bound";
      try {
        if (env.DB) {
          await env.DB.prepare("SELECT 1 AS ok").first();
          database = "connected";
        }
      } catch {
        database = "error";
      }
      return new Response(JSON.stringify({ status: "ok", database, service: "friendlot3d" }), { headers: cors });
    }
    return new Response(JSON.stringify({ service: "friendlot3d", message: "API starter", health: "/api/health" }), { headers: cors });
  }
};
