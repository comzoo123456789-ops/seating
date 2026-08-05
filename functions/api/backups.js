/* 백업 목록 / 복원 API
   - GET  /api/backups            → 백업 시각 목록 (최신순)
   - POST /api/backups {t}        → 해당 시점으로 복원 (편집 비밀번호 필요)
   저장 시 state.js 가 'bak:<ts>' 로 직전 상태를 보관하고 'bakindex' 로 목록 관리 */
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestGet({ env }) {
  const idx = JSON.parse((await env.SEATING_KV.get('bakindex')) || '[]');
  return json({ backups: idx });
}

export async function onRequestPost({ request, env }) {
  if ((request.headers.get('x-edit-pass') || '') !== (env.EDIT_PASSWORD || '0810'))
    return json({ ok: false, error: 'unauthorized' }, 401);
  let t;
  try { ({ t } = await request.json()); } catch (e) {}
  const bak = await env.SEATING_KV.get('bak:' + t);
  if (!bak) return json({ ok: false, error: 'not found' }, 404);
  // 복원 전 현재 상태도 백업
  try {
    const cur = await env.SEATING_KV.get('state');
    if (cur) {
      const ts = Date.now();
      await env.SEATING_KV.put('bak:' + ts, cur, { expirationTtl: 60 * 60 * 24 * 30 });
      let idx = JSON.parse((await env.SEATING_KV.get('bakindex')) || '[]');
      idx.unshift(ts); idx = idx.slice(0, 20);
      await env.SEATING_KV.put('bakindex', JSON.stringify(idx));
    }
  } catch (e) {}
  await env.SEATING_KV.put('state', bak);
  return json({ ok: true });
}
