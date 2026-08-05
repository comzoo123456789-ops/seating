/* 좌석 사전 예약 API — POST /api/reserve
   { id, name, dept, from }            → 예약 (관리자 비번 불필요, 빈자리·미예약만 허용)
   { action:'cancel', id }             → 예약 취소 (관리자 비번 x-edit-pass 필요)
   빈자리 검증만 통과하면 되므로, 일반 좌석 편집(관리자 전용)과는 분리된 안전한 경로 */
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  let b = {};
  try { b = await request.json(); } catch (e) {}
  const { action, id, name, dept, from } = b;
  const raw = await env.SEATING_KV.get('state');
  if (!raw) return json({ ok: false, error: 'no state' }, 404);
  const st = JSON.parse(raw);
  const d = st.items.find(i => i.id === id && i.type === 'desk');
  if (!d) return json({ ok: false, error: 'seat not found' }, 404);

  if (action === 'cancel') {
    if ((request.headers.get('x-edit-pass') || '') !== (env.EDIT_PASSWORD || '0810'))
      return json({ ok: false, error: 'unauthorized' }, 401);
    delete d.reserved;
  } else {
    if (d.name) return json({ ok: false, error: 'occupied' }, 409);
    if (d.reserved) return json({ ok: false, error: 'already', reserved: d.reserved }, 409);
    if (!name || !from) return json({ ok: false, error: 'need name/from' }, 400);
    d.reserved = { name: String(name).slice(0, 40), dept: String(dept || '').slice(0, 60), from: String(from).slice(0, 10), at: Date.now() };
  }
  // 백업 후 저장
  try {
    const ts = Date.now();
    await env.SEATING_KV.put('bak:' + ts, raw, { expirationTtl: 60 * 60 * 24 * 30 });
    let idx = JSON.parse((await env.SEATING_KV.get('bakindex')) || '[]');
    idx.unshift(ts); const drop = idx.slice(20); idx = idx.slice(0, 20);
    await env.SEATING_KV.put('bakindex', JSON.stringify(idx));
    for (const x of drop) await env.SEATING_KV.delete('bak:' + x);
  } catch (e) {}
  st.updatedAt = Date.now();
  await env.SEATING_KV.put('state', JSON.stringify(st));
  return json({ ok: true });
}
