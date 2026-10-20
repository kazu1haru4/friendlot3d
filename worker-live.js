const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};
const enc = new TextEncoder();
const adminIds = ["kazu1haru100", "kazu1haru4sub"];
const reply = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64u = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)), c => c.charCodeAt(0));

async function sign(payload, secret) {
  const h = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const data = h + "." + p;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return data + "." + b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
async function verify(token, secret) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, unb64u(s), enc.encode(h + "." + p))) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64u(p)));
    return payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256"
  }, key, 256);
  return b64u(bits);
}
async function schema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS game_saves (
    user_id TEXT PRIMARY KEY, cash REAL NOT NULL DEFAULT 500, rebirths INTEGER NOT NULL DEFAULT 0,
    floors INTEGER NOT NULL DEFAULT 1, owned_json TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS game_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
    started_at INTEGER NOT NULL, ends_at INTEGER
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS server_rooms (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK(visibility IN ('public','solo','invite')),
    status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
    max_players INTEGER NOT NULL DEFAULT 8
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS server_members (
    room_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
    PRIMARY KEY(room_id,user_id), FOREIGN KEY(room_id) REFERENCES server_rooms(id)
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS server_invites (
    code_hash TEXT PRIMARY KEY, room_id TEXT NOT NULL, created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL, uses_left INTEGER NOT NULL DEFAULT 20
  )`).run();
}
async function authPayload(request, env) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? verify(header.slice(7), env.SESSION_SECRET || "") : null;
}
const validId = id => /^[A-Za-z0-9_]{3,24}$/.test(id);


const makeInviteCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...crypto.getRandomValues(new Uint8Array(10))].map(n => alphabet[n % alphabet.length]).join("");
};
async function hashInviteCode(code) {
  const bytes = await crypto.subtle.digest("SHA-256", enc.encode(code.toUpperCase()));
  return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === "/api/health") return reply({ service: "friendlot3d", status: "ok" });

    try { await schema(env.DB); }
    catch (error) {
      console.error("D1 schema error:", error);
      return reply({ error: "WorkerのD1バインディング名をDBに設定してください" }, 500);
    }

    try {
      if (url.pathname === "/api/auth/register" || url.pathname === "/api/auth/login") {
        if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
        let body;
        try { body = await request.json(); } catch { return reply({ error: "JSONが不正です" }, 400); }
        const id = String(body.id || "").trim();
        const password = String(body.password || "");
        if (!validId(id)) return reply({ error: "IDは英数字と _ の3〜24文字です" }, 400);
        if (password.length < 8 || password.length > 128) return reply({ error: "パスワードは8〜128文字にしてください" }, 400);
        if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return reply({ error: "SESSION_SECRET（32文字以上）が未設定です" }, 500);

        if (url.pathname.endsWith("/register")) {
          const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
          const passwordHash = await hashPassword(password, salt);
          try {
            await env.DB.prepare("INSERT INTO users(id,salt,password_hash,created_at) VALUES(?,?,?,?)").bind(id, salt, passwordHash, Date.now()).run();
            await env.DB.prepare("INSERT INTO game_saves(user_id,cash,rebirths,floors,owned_json,updated_at) VALUES(?,500,0,1,'[]',?)").bind(id, Date.now()).run();
          } catch (error) {
            console.error("Register database error:", error);
            return reply({ error: "そのユーザーIDは使われているか、保存に失敗しました" }, 409);
          }
        } else {
          const row = await env.DB.prepare("SELECT salt,password_hash FROM users WHERE id=?").bind(id).first();
          if (!row) return reply({ error: "IDまたはパスワードが違います" }, 401);
          if (await hashPassword(password, row.salt) !== row.password_hash) return reply({ error: "IDまたはパスワードが違います" }, 401);
        }
        const token = await sign({ sub: id, exp: Math.floor(Date.now() / 1000) + 86400, role: adminIds.includes(id) ? "admin" : "player" }, env.SESSION_SECRET);
        return reply({ id, token, expiresIn: 86400 });
      }


      // Read-only Supabase catalog bridge. Uses only the public/publishable key;
      // never put a service-role key in browser code or use it for this endpoint.
      if (url.pathname === "/api/brainrot/catalog") {
        if (request.method !== "GET") return reply({ error: "Method not allowed" }, 405);
        const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
        const supabaseKey = String(env.SUPABASE_ANON_KEY || "");
        if (!supabaseUrl || !supabaseKey) {
          return reply({ error: "WorkerにSUPABASE_URLとSUPABASE_ANON_KEYを設定してください" }, 503);
        }
        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/brainrot_catalog?select=id,name,rarity,emoji,income_per_minute,is_fuse_only,is_shop_available,purchase_price,image_url&is_shop_available=eq.true&order=name.asc`, {
            method: "GET",
            headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: "application/json" }
          });
          if (!response.ok) {
            console.error("Supabase catalog error:", response.status, await response.text());
            return reply({ error: "Supabaseの図鑑データを取得できませんでした" }, 502);
          }
          const rows = await response.json();
          if (!Array.isArray(rows)) return reply({ error: "Supabaseから不正なデータが返されました" }, 502);
          return reply({ characters: rows });
        } catch (error) {
          console.error("Supabase catalog request failed:", error);
          return reply({ error: "Supabaseに接続できませんでした" }, 502);
        }
      }

      // Server room APIs. Identity is always taken from the signed session token.
      if (url.pathname.startsWith("/api/servers/")) {
        if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
        const user = await authPayload(request, env);
        if (!user) return reply({ error: "ログインしてください" }, 401);
        let body = {};
        try { body = await request.json(); } catch { return reply({ error: "JSONが不正です" }, 400); }
        const now = Math.floor(Date.now() / 1000);
        const uid = String(user.sub);

        if (url.pathname === "/api/servers/private/create") {
          const mode = body.mode === "invite" ? "invite" : body.mode === "solo" ? "solo" : null;
          if (!mode) return reply({ error: "modeはsoloまたはinviteにしてください" }, 400);
          const id = crypto.randomUUID();
          const name = String(body.name || "マイサーバー").trim().slice(0, 32) || "マイサーバー";
          await env.DB.prepare("INSERT INTO server_rooms(id,owner_id,name,visibility,created_at) VALUES(?,?,?,?,?)")
            .bind(id, uid, name, mode, now).run();
          await env.DB.prepare("INSERT INTO server_members(room_id,user_id,joined_at) VALUES(?,?,?)")
            .bind(id, uid, now).run();
          let inviteCode = null;
          if (mode === "invite") {
            inviteCode = makeInviteCode();
            await env.DB.prepare("INSERT INTO server_invites(code_hash,room_id,created_by,expires_at,uses_left) VALUES(?,?,?,?,?)")
              .bind(await hashInviteCode(inviteCode), id, uid, now + 7 * 86400, 20).run();
          }
          return reply({ room: { id, name, visibility: mode, ownerId: uid }, inviteCode });
        }

        if (url.pathname === "/api/servers/private/join") {
          const code = String(body.inviteCode || "").trim().toUpperCase();
          if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) return reply({ error: "招待コードが正しくありません" }, 400);
          const invite = await env.DB.prepare("SELECT i.room_id,i.expires_at,i.uses_left,r.name,r.visibility,r.status,r.max_players FROM server_invites i JOIN server_rooms r ON r.id=i.room_id WHERE i.code_hash=?")
            .bind(await hashInviteCode(code)).first();
          if (!invite || invite.expires_at < now || invite.uses_left < 1 || invite.status !== "open" || invite.visibility !== "invite")
            return reply({ error: "招待コードが無効か、期限切れです" }, 403);
          const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM server_members WHERE room_id=?").bind(invite.room_id).first();
          const already = await env.DB.prepare("SELECT 1 AS ok FROM server_members WHERE room_id=? AND user_id=?").bind(invite.room_id, uid).first();
          if (!already && count.n >= invite.max_players) return reply({ error: "サーバーが満員です" }, 409);
          if (!already) {
            await env.DB.prepare("INSERT INTO server_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(invite.room_id, uid, now).run();
            await env.DB.prepare("UPDATE server_invites SET uses_left=uses_left-1 WHERE code_hash=? AND uses_left>0").bind(await hashInviteCode(code)).run();
          }
          return reply({ room: { id: invite.room_id, name: invite.name, visibility: invite.visibility } });
        }

        if (url.pathname === "/api/servers/public/join") {
          let room = await env.DB.prepare("SELECT id,name,visibility,max_players FROM server_rooms WHERE visibility='public' AND status='open' ORDER BY created_at ASC LIMIT 1").first();
          if (!room) {
            const id = crypto.randomUUID();
            room = { id, name: "公開サーバー", visibility: "public", max_players: 8 };
            await env.DB.prepare("INSERT INTO server_rooms(id,owner_id,name,visibility,created_at,max_players) VALUES(?,?,?,?,?,?)")
              .bind(id, "system", room.name, "public", now, 8).run();
          }
          const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM server_members WHERE room_id=?").bind(room.id).first();
          const already = await env.DB.prepare("SELECT 1 AS ok FROM server_members WHERE room_id=? AND user_id=?").bind(room.id, uid).first();
          if (!already && count.n >= room.max_players) return reply({ error: "公開サーバーが満員です" }, 409);
          if (!already) await env.DB.prepare("INSERT INTO server_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(room.id, uid, now).run();
          return reply({ room });
        }

        if (url.pathname === "/api/servers/my") {
          const rows = await env.DB.prepare("SELECT r.id,r.name,r.visibility,r.owner_id,r.created_at FROM server_rooms r JOIN server_members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.created_at DESC LIMIT 50")
            .bind(uid).all();
          return reply({ rooms: rows.results || [] });
        }
        return reply({ error: "Not found" }, 404);
      }

      if (url.pathname === "/api/game/save") {
        const user = await authPayload(request, env);
        if (!user) return reply({ error: "ログインしてください" }, 401);
        if (request.method === "GET") {
          const row = await env.DB.prepare("SELECT cash,rebirths,floors,owned_json FROM game_saves WHERE user_id=?").bind(user.sub).first();
          if (!row) return reply({ error: "セーブデータが見つかりません" }, 404);
          let owned = [];
          try { owned = JSON.parse(row.owned_json || "[]"); } catch {}
          return reply({ id: user.sub, cash: row.cash, rebirths: row.rebirths, floors: row.floors, owned });
        }
        if (request.method === "POST") {
          let body;
          try { body = await request.json(); } catch { return reply({ error: "JSONが不正です" }, 400); }
          const cash = Number(body.cash), rebirths = Number(body.rebirths), floors = Number(body.floors);
          if (!Number.isFinite(cash) || cash < 0 || !Number.isInteger(rebirths) || rebirths < 0 || !Number.isInteger(floors) || floors < 1 || !Array.isArray(body.owned)) {
            return reply({ error: "セーブデータの形式が正しくありません" }, 400);
          }
          await env.DB.prepare("INSERT INTO game_saves(user_id,cash,rebirths,floors,owned_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET cash=excluded.cash,rebirths=excluded.rebirths,floors=excluded.floors,owned_json=excluded.owned_json,updated_at=excluded.updated_at").bind(user.sub, cash, rebirths, floors, JSON.stringify(body.owned), Date.now()).run();
          return reply({ ok: true });
        }
        return reply({ error: "Method not allowed" }, 405);
      }

      if (url.pathname === "/api/event") {
        const event = await env.DB.prepare("SELECT id,event_type,active,started_at,ends_at FROM game_events WHERE active=1 ORDER BY id DESC LIMIT 1").first();
        return reply({ event: event || null });
      }

      if (url.pathname === "/api/admin/event/end") {
        const user = await authPayload(request, env);
        if (!user || !adminIds.includes(user.sub)) return reply({ error: "管理者権限が必要です" }, 403);
        if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
        await env.DB.prepare("UPDATE game_events SET active=0 WHERE active=1").run();
        return reply({ ok: true });
      }

      return reply({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker request error:", error);
      return reply({ error: "サーバー内部でエラーが発生しました" }, 500);
    }
  }
};
