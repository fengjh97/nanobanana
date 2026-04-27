// Shared helpers for Pages Functions: HMAC token, lockout, cors.

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const LOCKOUT_MAX = 10;
const LOCKOUT_WINDOW_SECONDS = 30 * 60;

function bytesToBase64Url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.byteLength; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(env) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ exp })));
  const key = await importHmacKey(env.TOKEN_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(sig)}`;
}

export async function verifyToken(env, token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const key = await importHmacKey(env.TOKEN_SECRET);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sig),
      new TextEncoder().encode(payload)
    );
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
    if (typeof data.exp !== "number") return false;
    return data.exp > Math.floor(Date.now() / 1000);
  } catch (_) {
    return false;
  }
}

// Constant-time string compare, decoded to bytes first to defeat shortcut on length.
export function constantTimeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a));
  const eb = new TextEncoder().encode(String(b));
  const len = Math.max(ea.length, eb.length);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < len; i += 1) {
    diff |= (ea[i] || 0) ^ (eb[i] || 0);
  }
  return diff === 0;
}

export async function getLockoutState(env) {
  const raw = await env.LOCKOUT_KV.get("login_state");
  if (!raw) return { fails: 0, until: 0 };
  try {
    const data = JSON.parse(raw);
    return { fails: Number(data.fails) || 0, until: Number(data.until) || 0 };
  } catch (_) {
    return { fails: 0, until: 0 };
  }
}

export async function setLockoutState(env, state) {
  await env.LOCKOUT_KV.put("login_state", JSON.stringify(state), {
    // Auto-expire so old state never leaks forward.
    expirationTtl: LOCKOUT_WINDOW_SECONDS * 2,
  });
}

export async function clearLockout(env) {
  await env.LOCKOUT_KV.delete("login_state");
}

export const LOCK_LIMIT = LOCKOUT_MAX;
export const LOCK_WINDOW = LOCKOUT_WINDOW_SECONDS;

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}
