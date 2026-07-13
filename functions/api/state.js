/* ════════════════════════════════════════════════════════════════
   Cloudflare Pages Function — 자리배치도 공유 상태 API
   기존 server.js 의 /api/state 를 KV 기반으로 그대로 대체합니다.
     - GET  /api/state → KV 에 저장된 공유 상태(JSON) 반환 (없으면 null)
     - PUT  /api/state → 공유 상태 저장
     - POST /api/state → PUT 과 동일
   KV 바인딩 이름: SEATING_KV  (wrangler.toml 참고)
   ════════════════════════════════════════════════════════════════ */

const KEY = 'state';

export async function onRequestGet({ env }) {
  const txt = await env.SEATING_KV.get(KEY);
  return new Response(txt ?? 'null', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function save({ request, env }) {
  const body = await request.text();
  if (body.length > 30 * 1024 * 1024) {
    return new Response('{"ok":false,"error":"too large"}', {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  await env.SEATING_KV.put(KEY, body);
  return new Response('{"ok":true}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPut = save;
export const onRequestPost = save;
