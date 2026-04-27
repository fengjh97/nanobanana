import { verifyToken, jsonResponse } from "../_shared.js";

const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

export const onRequestPost = async ({ request, env }) => {
  if (!env.GEMINI_API_KEY || !env.TOKEN_SECRET) {
    return jsonResponse({ error: "server_misconfigured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!(await verifyToken(env, token))) {
    return jsonResponse({ error: "unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: "bad_json" }, { status: 400 });
  }

  const parts = Array.isArray(body?.parts) ? body.parts : null;
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "1:1";
  if (!parts || !parts.length) {
    return jsonResponse({ error: "missing_parts" }, { status: 400 });
  }

  const upstreamBody = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: 32768,
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize: "1K" },
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "OFF" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "OFF" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "OFF" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "OFF" },
    ],
  };

  const upstream = await fetch(GEMINI_ENDPOINT(env.GEMINI_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(upstreamBody),
  });

  if (!upstream.ok) {
    let detail = "";
    try {
      const j = await upstream.json();
      detail = j?.error?.message || JSON.stringify(j);
    } catch (_) {
      detail = await upstream.text();
    }
    return jsonResponse(
      { error: "gemini_error", status: upstream.status, detail },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const images = [];
  let text = "";
  for (const cand of data.candidates || []) {
    for (const part of cand?.content?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) images.push(inline.data);
      else if (typeof part.text === "string") text += part.text;
    }
  }
  return jsonResponse({ images, text });
};
