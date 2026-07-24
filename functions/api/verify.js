/* 편집 비밀번호 확인 — POST /api/verify { password }
   맞으면 200 {ok:true}, 틀리면 401. 실제 저장(PUT /api/state)도 서버에서 재확인함. */
export async function onRequestPost({ request, env }) {
  let password = '';
  try { ({ password } = await request.json()); } catch (e) {}
  const ok = password === (env.EDIT_PASSWORD || '0810');
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
