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
  // ── 편집 비밀번호 확인 (헤더 x-edit-pass) ──
  const pass = request.headers.get('x-edit-pass') || '';
  if (pass !== (env.EDIT_PASSWORD || '0810')) {
    return new Response('{"ok":false,"error":"unauthorized"}', {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const body = await request.text();
  if (body.length > 30 * 1024 * 1024) {
    return new Response('{"ok":false,"error":"too large"}', {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // ── 자동 백업: 덮어쓰기 전 현재 상태를 보관 (최근 20개, 30일 보관) ──
  try {
    const cur = await env.SEATING_KV.get(KEY);
    if (cur) {
      const ts = Date.now();
      await env.SEATING_KV.put('bak:' + ts, cur, { expirationTtl: 60 * 60 * 24 * 30 });
      let idx = JSON.parse((await env.SEATING_KV.get('bakindex')) || '[]');
      idx.unshift(ts);
      const drop = idx.slice(20);
      idx = idx.slice(0, 20);
      await env.SEATING_KV.put('bakindex', JSON.stringify(idx));
      for (const d of drop) await env.SEATING_KV.delete('bak:' + d);
    }
  } catch (e) { /* 백업 실패해도 저장은 진행 */ }
  await env.SEATING_KV.put(KEY, body);
  return new Response('{"ok":true}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPut = save;
export const onRequestPost = save;
