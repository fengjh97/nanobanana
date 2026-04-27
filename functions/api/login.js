import {
  signToken,
  constantTimeEqual,
  getLockoutState,
  setLockoutState,
  clearLockout,
  jsonResponse,
  LOCK_LIMIT,
  LOCK_WINDOW,
} from "../_shared.js";

export const onRequestPost = async ({ request, env }) => {
  if (!env.PIN || !env.TOKEN_SECRET || !env.LOCKOUT_KV) {
    return jsonResponse({ error: "server_misconfigured" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: "bad_json" }, { status: 400 });
  }
  const pin = (body && typeof body.pin === "string") ? body.pin : "";
  if (!pin) return jsonResponse({ error: "missing_pin" }, { status: 400 });

  const now = Math.floor(Date.now() / 1000);
  const state = await getLockoutState(env);

  if (state.fails >= LOCK_LIMIT && state.until > now) {
    return jsonResponse(
      { error: "locked", retry_after: state.until - now },
      { status: 423 }
    );
  }

  // Window expired — reset counter on next attempt.
  let fails = state.fails;
  if (state.until > 0 && state.until <= now) fails = 0;

  if (!constantTimeEqual(pin, env.PIN)) {
    fails += 1;
    const locked = fails >= LOCK_LIMIT;
    await setLockoutState(env, {
      fails,
      until: locked ? now + LOCK_WINDOW : 0,
    });
    return jsonResponse(
      {
        error: locked ? "locked" : "wrong_pin",
        attempts_left: Math.max(0, LOCK_LIMIT - fails),
        retry_after: locked ? LOCK_WINDOW : null,
      },
      { status: locked ? 423 : 401 }
    );
  }

  await clearLockout(env);
  const token = await signToken(env);
  return jsonResponse({ token, ttl: 12 * 60 * 60 });
};
