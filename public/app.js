/* ════════════════════════════════════════════════════════════════
   자리배치도 · wylie — Cloudflare Pages + KV
   - GET /api/state 로 상태 로드 (없으면 seed.json)
   - 로드 시 벽선(line) 자동 병합
   - 보기: 층 전환·검색·부서필터·좌석 상세
   - 관리자 편집(비밀번호): 좌석 이동/편집/추가/삭제, 임직원 입사/퇴사, 저장(PUT /api/state)
   ════════════════════════════════════════════════════════════════ */
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const uid=()=> 'x'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const snap=(v,g=5)=>Math.round(v/g)*g, clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const ADMIN_PW='0810';

/* ── 프리미엄 라인 아이콘 ── */
const IC={
  wc:'<circle cx="12" cy="6" r="2.7"/><path d="M6 20a6 6 0 0 1 12 0"/>',
  locker:'<rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 7h4"/><path d="M13.5 11.5v2"/>',
  printer:'<path d="M7 8V4h10v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M7 14h10v6H7z"/><circle cx="8" cy="11" r=".7" fill="currentColor" stroke="none"/>',
  phone:'<path d="M6.5 4.5 9 4l1.6 4-2 1.3a12 12 0 0 0 5.6 5.6l1.3-2 4 1.6-.5 2.4A2 2 0 0 1 17.9 20 15 15 0 0 1 4 6.1 2 2 0 0 1 6.5 4.5z"/>',
  table:'<rect x="3.5" y="7" width="17" height="3" rx="1"/><path d="M6 10v7M18 10v7"/>',
  elevator:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 6.5 9.8 9.5h4.4L12 6.5z" fill="currentColor" stroke="none"/><path d="M12 17.5 9.8 14.5h4.4L12 17.5z" fill="currentColor" stroke="none"/>',
  stairs:'<path d="M3 19h4v-4h4v-4h4v-4h5"/>',
  coffee:'<path d="M5 8h11v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 9h2.2a2.3 2.3 0 0 1 0 4.6H16"/><path d="M8 3.5v1.5M11 3.5v1.5"/>',
  sofa:'<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M6 17v2M18 17v2"/>',
  box:'<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  archive:'<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 10h16M4 15h16"/><path d="M10 7h4M10 12.5h4M10 17.5h4"/>',
  monitor:'<rect x="3" y="4.5" width="18" height="11" rx="2"/><path d="M8 19.5h8M12 15.5v4"/>',
  kiosk:'<rect x="6" y="3" width="12" height="13" rx="1.5"/><path d="M9 19.5h6M12 16v3.5"/>',
  meeting:'<circle cx="9" cy="8" r="2.3"/><circle cx="16" cy="8.5" r="1.9"/><path d="M4.5 18a4.5 4.5 0 0 1 9 0"/><path d="M14 18a4.2 4.2 0 0 1 5.5-4"/>',
  plant:'<path d="M12 21v-9"/><path d="M12 12C12 8.5 9.2 6 5.5 6c0 3.5 2.8 6 6.5 6z"/><path d="M12 14c0-2.8 2.6-5 6-5 0 2.8-2.6 5-6 5z"/>',
  hvac:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 9v6M11 9v6M15.5 9v6"/>',
  building:'<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9.5 16h5v5"/>',
  corridor:'<path d="M8 12h8M8 12l3-3M8 12l3 3M16 12l-3-3M16 12l-3 3"/>',
  lab:'<path d="M9 3h6M10 3v6l-5.2 8.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.2-2.5L14 9V3"/><path d="M7.5 14.5h9"/>',
  pin:'<path d="M12 21s-6-5.2-6-10a6 6 0 0 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/>',
};
function kindOf(t){ t=(t||'').toLowerCase();
  if(/락커|locker/.test(t))return 'locker'; if(/화장실|toilet|wc/.test(t))return 'wc';
  if(/복합기|프린터|printer/.test(t))return 'printer'; if(/폰|전화|부스|phone/.test(t))return 'phone';
  if(/테이블|table/.test(t))return 'table'; if(/엘리|엘베|e\/v|elevator|승강/.test(t))return 'elevator';
  if(/계단|stair/.test(t))return 'stairs'; if(/탕비|oa|pantry/.test(t))return 'coffee';
  if(/라운지|소파|쇼파|lounge/.test(t))return 'sofa'; if(/창고|storage/.test(t))return 'box';
  if(/서랍|캐비|수납|archive/.test(t))return 'archive'; if(/디스플레이|전자칠판|모니터|스크린|칠판|tv/.test(t))return 'monitor';
  if(/키오스크|kiosk/.test(t))return 'kiosk'; if(/회의|미팅|meeting/.test(t))return 'meeting';
  if(/발코니|외부|테라스|정원|garden/.test(t))return 'plant'; if(/실외기|mdf|공조|hvac/.test(t))return 'hvac';
  if(/사장|대표|사무실|office|lush/.test(t))return 'building'; if(/통로|복도|corridor/.test(t))return 'corridor';
  if(/연구소|lab|랩실/.test(t))return 'lab'; return 'pin'; }

/* ── 벽선 병합 (끊긴 조각 → 하나의 실선) ── */
function mergeWalls(items, floors){
  const AXIS=7, BRIDGE=16, CORNER=24, TH=6;
  const norm=l=> (l.orient||'h')==='h'
    ? {o:'h', axis:l.y+l.h/2, a:Math.min(l.x,l.x+l.w), b:Math.max(l.x,l.x+l.w)}
    : {o:'v', axis:l.x+l.w/2, a:Math.min(l.y,l.y+l.h), b:Math.max(l.y,l.y+l.h)};
  const clusterMap=(vals,tol)=>{ const u=[...new Set(vals)].sort((x,y)=>x-y); const rep=new Map(); let g=[];
    const flush=()=>{ if(!g.length)return; const m=Math.round(g.reduce((s,v)=>s+v,0)/g.length); g.forEach(v=>rep.set(v,m)); g=[]; };
    for(const v of u){ if(!g.length||v-g[g.length-1]<=tol)g.push(v); else{flush();g.push(v);} } flush(); return rep; };
  let out=[];
  floors.forEach(f=>{
    const lines=items.filter(i=>i.type==='line'&&i.floorId===f.id); if(!lines.length)return;
    let segs=lines.map(norm);
    const hMap=clusterMap(segs.filter(s=>s.o==='h').map(s=>s.axis),AXIS);
    const vMap=clusterMap(segs.filter(s=>s.o==='v').map(s=>s.axis),AXIS);
    segs.forEach(s=>s.axis=(s.o==='h'?hMap:vMap).get(s.axis));
    const hAx=[...new Set(segs.filter(s=>s.o==='h').map(s=>s.axis))], vAx=[...new Set(segs.filter(s=>s.o==='v').map(s=>s.axis))];
    const snapTo=(v,ax)=>{ let best=v,d=CORNER+1; for(const a of ax){const dd=Math.abs(a-v); if(dd<d){d=dd;best=a;}} return d<=CORNER?best:v; };
    segs.forEach(s=>{ const ax=s.o==='h'?vAx:hAx; const a=snapTo(s.a,ax),b=snapTo(s.b,ax); if(b-a>=2){s.a=a;s.b=b;} });
    const by={}; segs.forEach(s=>{const k=s.o+':'+s.axis;(by[k]=by[k]||{o:s.o,axis:s.axis,segs:[]}).segs.push(s);});
    Object.values(by).forEach(g=>{ g.segs.sort((x,y)=>x.a-y.a); const m=[];
      for(const s of g.segs){ const last=m[m.length-1]; if(last&&s.a<=last.b+BRIDGE)last.b=Math.max(last.b,s.b); else m.push({a:s.a,b:s.b}); }
      m.forEach(seg=> out.push(g.o==='h'
        ? {id:uid(),floorId:f.id,type:'line',orient:'h',x:seg.a,y:Math.round(g.axis-TH/2),w:seg.b-seg.a,h:TH,thickness:TH,color:'#aab0bd',lineStyle:'solid',z:0}
        : {id:uid(),floorId:f.id,type:'line',orient:'v',x:Math.round(g.axis-TH/2),y:seg.a,w:TH,h:seg.b-seg.a,thickness:TH,color:'#aab0bd',lineStyle:'solid',z:0})); });
  });
  return items.filter(i=>i.type!=='line').concat(out);
}

/* ── 상태 ── */
let STATE={floors:[],depts:[],employees:[],items:[]};
let DBYID={}, DBYNAME={};
let fi=0, view={s:1,tx:0,ty:0}, filter=null, vacantMode=false, activeId=null;
let editMode=false, dirty=false, selected=new Set(), drag=null, lastTap=null, adminPw='';
let measMode=false, mstart=null, mprev=null;
const wrap=$('#wrap'), stage=$('#stage'), paper=$('#paper'), walls=$('#walls'), dlayer=$('#dlayer'), mlayer=$('#mlayer'), tip=$('#tip');
const curFloor=()=>STATE.floors[fi], curId=()=>curFloor()&&curFloor().id;
const fItems=()=>STATE.items.filter(i=>i.floorId===curId());
const initials=nm=> nm?(nm.length>=3?nm.slice(1):nm):'';

async function loadState(){
  let s=null;
  try{ const r=await fetch('/api/state',{cache:'no-store'}); const j=JSON.parse(await r.text()); if(j&&j.items)s=j; }catch(e){}
  if(!s){ try{ s=await fetch('seed.json',{cache:'no-store'}).then(r=>r.json()); }catch(e){ s={floors:[],depts:[],employees:[],items:[]}; } }
  s.floors=s.floors||[]; s.depts=s.depts||[]; s.employees=s.employees||[]; s.items=s.items||[];
  s.employees.forEach(e=>{ if(!e.id)e.id=uid(); });
  s.items.forEach(i=>{ if(!i.id)i.id=uid(); });
  s.items=mergeWalls(s.items,s.floors);
  // 사용 시작일이 지난 예약 → 정식 좌석(재석)으로 자동 전환
  const today=new Date().toISOString().slice(0,10);
  const dn=Object.fromEntries((s.depts||[]).map(d=>[d.name,d.id]));
  s.items.forEach(i=>{ if(i.type==='desk'&&i.reserved&&!i.name&&i.reserved.from&&i.reserved.from<=today){
    i.name=i.reserved.name; if(dn[i.reserved.dept])i.deptId=dn[i.reserved.dept]; i.occupied=true; delete i.reserved; } });
  calibrateAll(s); // 저장된 외곽 치수(예: 25.55 / 14.9)로 각 층 배율 자동 보정
  return s;
}

/* ── 렌더 ── */
function refreshMaps(){ DBYID=Object.fromEntries(STATE.depts.map(d=>[d.id,d])); DBYNAME=Object.fromEntries(STATE.depts.map(d=>[d.name,d])); }

/* ── 책상 실치수 · 면적 (재무 면적/비용 배분용) ── */
function deskDefaults(it){ if(it.orient!=='h'&&it.orient!=='v')it.orient=(it.w>=it.h?'h':'v'); if(!(it.dn>=1))it.dn=1; if(!(it.mmU>0))it.mmU=1400; if(!(it.mmD>0))it.mmD=700; }
function deskArea(it){ return (it.mmU||1400)*(it.dn||1)*(it.mmD||700)/1e6; } // ㎡
function deskDims(it){ const L=(it.mmU||1400)*(it.dn||1), D=(it.mmD||700); return it.orient==='v'?{w:D,h:L}:{w:L,h:D}; } // 실제 가로·세로(mm)
function deskTip(it){ const d=deskDims(it); return `${d.w} × ${d.h}mm · ${(d.w*d.h/1e6).toFixed(2)}㎡`; }
function setDeskSize(it,orient,dn,mmU,mmD){ deskDefaults(it);
  const oldLong=(it.orient==='v'?it.h:it.w), oldShort=(it.orient==='v'?it.w:it.h), unit=oldLong/(it.dn||1);
  it.orient=(orient==='v'?'v':'h'); it.dn=Math.max(1,dn|0||1); it.mmU=mmU||1400; it.mmD=mmD||700;
  const newLong=Math.max(8,Math.round(unit*it.dn)), newShort=Math.max(8,Math.round(oldShort));
  if(it.orient==='v'){ it.h=newLong; it.w=newShort; } else { it.w=newLong; it.h=newShort; } }

function tabs(){ $('#floors').innerHTML=STATE.floors.map((f,i)=>`<button class="${i===fi?'on':''}" data-i="${i}">${esc(f.name)}</button>`).join('');
  $$('#floors button').forEach(b=>b.onclick=()=>{fi=+b.dataset.i; activeId=null; selected.clear(); closePanel(); render(); fit(); drawMeas();}); }

function render(){
  const f=curFloor(); if(!f)return;
  $$('#floors button').forEach(b=>b.classList.toggle('on',+b.dataset.i===fi));
  paper.style.width=f.w+'px'; paper.style.height=f.h+'px';
  walls.setAttribute('viewBox',`0 0 ${f.w} ${f.h}`); walls.style.width=f.w+'px'; walls.style.height=f.h+'px';
  mlayer.setAttribute('viewBox',`0 0 ${f.w} ${f.h}`); mlayer.style.width=f.w+'px'; mlayer.style.height=f.h+'px';
  dlayer.setAttribute('viewBox',`0 0 ${f.w} ${f.h}`); dlayer.style.width=f.w+'px'; dlayer.style.height=f.h+'px';
  walls.innerHTML='';
  $$('.item',paper).forEach(el=>el.remove());
  let html='';
  fItems().forEach(it=>{
    const st=`left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px`;
    if(it.type==='line'){ const col=(it.color&&it.color[0]==='#')?it.color:'var(--wall)'; html+=`<div class="item line" data-id="${it.id}" style="${st};background:${col}"></div>`; return; }
    if(it.type==='meas'||it.type==='dim')return;
    if(it.type==='shape'){ html+=`<div class="item pillar" data-id="${it.id}" style="${st}"></div>`; return; }
    if(it.type==='facility'){ const lbl=(it.label||'').replace(/\n/g,' '); const k=kindOf(lbl); const big=it.w*it.h>=9000;
      const md=Math.min(it.w,it.h);
      const isz=big?clamp(Math.round(md*0.42),18,48):19, fsz=big?clamp(Math.round(md*0.16),10,22):10;
      html+=`<div class="item ${big?'space':'mk'}" data-id="${it.id}" style="${st}"><span class="ic"><svg viewBox="0 0 24 24" style="width:${isz}px;height:${isz}px">${IC[k]}</svg></span>${lbl?`<span class="lb" style="font-size:${fsz}px">${esc(lbl)}</span>`:''}</div>`; return; }
    if(it.type==='label'){ const fs=clamp(it.fontSize||14,12,18);
      html+=`<div class="item anno" data-id="${it.id}" style="${st};font-size:${fs}px">${esc((it.text||'').replace(/\n/g,' '))}</div>`; return; }
    if(it.type==='desk'){ const dep=DBYID[it.deptId]; const c=dep?dep.color:'#9aa1b0'; const vac=!it.name; const resv=vac&&it.reserved;
      if(resv){ const p=(it.reserved.from||'').split('-'); const md=p.length===3?(+p[1])+'/'+(+p[2]):'';
        html+=`<div class="item desk resv" data-id="${it.id}" style="${st};--dc:#e8912a"><span class="nm">${esc(it.reserved.name)}</span><span class="rk">예약 ${md}~</span></div>`; }
      else html+=`<div class="item desk ${vac?'vacant':''}" data-id="${it.id}" style="${st};--dc:${c}"><span class="nm">${vac?'빈자리':esc(it.name)}</span></div>`; }
  });
  paper.insertAdjacentHTML('beforeend',html);
  // hover tooltip (보기용)
  $$('.desk',paper).forEach(el=>{ const it=STATE.items.find(x=>x.id===el.dataset.id); if(!it||!it.name)return; const dep=DBYID[it.deptId];
    el.addEventListener('pointerenter',e=>{ if(drag)return; tip.innerHTML=`${esc(it.name)}<span class="r">${esc(dep?dep.name:'')}${it.title?' · '+esc(it.title):''}</span>`; tip.classList.add('on'); moveTip(e); });
    el.addEventListener('pointermove',moveTip); el.addEventListener('pointerleave',()=>tip.classList.remove('on')); });
  paintSel(); stats(); legend(); floccu(); applyFilter();
}
function moveTip(e){ tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+16)+'px'; }

function stats(){ const tot=STATE.employees.length, seated=STATE.items.filter(i=>i.type==='desk'&&i.name).length, un=Math.max(0,tot-seated);
  const pct=tot?Math.round(seated/tot*100):0;
  $('#stats').innerHTML=`<span><b>${tot}</b>임직원</span><span class="sep"></span><span><b>${seated}</b>배치</span><span class="sep"></span><span><b>${un}</b>미배치</span><span class="sep"></span><span class="accent"><b>${pct}%</b>배치율</span>`; }
function empCnt(){ const c={}; STATE.employees.forEach(e=>{const d=DBYNAME[e.dept]; if(d)c[d.id]=(c[d.id]||0)+1;}); return c; }
function legend(){ const cnt=empCnt(); const pres=STATE.depts.filter(d=>cnt[d.id]).sort((a,b)=>cnt[b.id]-cnt[a.id]);
  const av=fItems().filter(i=>i.type==='desk'&&!i.name&&!i.reserved).length;
  const vchip=`<span class="chip vchip ${vacantMode?'on':''}" id="vacChip" title="빈자리만 강조 (다시 누르면 해제)"><span class="dot"></span>빈자리<span class="ct">${av}</span></span>`;
  $('#legend').innerHTML='<span class="llab">본부</span>'+vchip+pres.map(d=>`<span class="chip ${filter===d.id?'on':''} ${filter&&filter!==d.id?'faded':''}" data-id="${d.id}" style="--dc:${d.color}"><span class="dot"></span>${esc(d.name)}<span class="ct">${cnt[d.id]}</span></span>`).join('');
  $$('#legend .chip[data-id]').forEach(c=>c.onclick=()=>selectDept(c.dataset.id));
  const vc=$('#vacChip'); if(vc)vc.onclick=toggleVacant; }
function floccu(){ const f=curFloor(); const ds=fItems().filter(i=>i.type==='desk'); const o=ds.filter(d=>d.name).length; $('#floccu').innerHTML=`${esc(f.name)} · 재석 <b>${o}</b>/${ds.length}`; }
function selectDept(id){ filter=filter===id?null:id;
  if(filter){ const idx=STATE.floors.findIndex(f=>STATE.items.some(i=>i.type==='desk'&&i.floorId===f.id&&i.deptId===filter&&i.name)); if(idx>=0&&idx!==fi)fi=idx; }
  render(); if(filter)fit(); paintFilter(); }
function paintFilter(){ $$('#legend .chip[data-id]').forEach(c=>{c.classList.toggle('on',c.dataset.id===filter); c.classList.toggle('faded',filter&&c.dataset.id!==filter);}); const vc=$('#vacChip'); if(vc)vc.classList.toggle('on',vacantMode); $('#clrFilter').hidden=!(filter||vacantMode); }
function toggleVacant(){ vacantMode=!vacantMode; if(vacantMode){ $('#q').value=''; searchMatches=[]; } render(); paintFilter(); if(vacantMode)fit(); }
$('#clrFilter').onclick=()=>{filter=null; vacantMode=false; render(); paintFilter();};

function applyFilter(){ const q=$('#q').value.trim().toLowerCase(); let first=null;
  const active=!!(q||filter||vacantMode);
  $$('.desk',paper).forEach(el=>{ const it=STATE.items.find(x=>x.id===el.dataset.id);
    const vac=!it.name, avail=vac&&!it.reserved;
    el.classList.remove('avail');
    if(vac){
      if(vacantMode){ const hit=avail&&(!filter||it.deptId===filter);
        el.classList.toggle('hit',hit); el.classList.toggle('dim',!hit); el.classList.toggle('avail',hit); if(hit&&!first)first=it; }
      else { el.classList.toggle('dim',active); el.classList.remove('hit'); }
      return;
    }
    const dep=DBYID[it.deptId]; let hit=true;
    if(q){const hay=[it.name,it.title,dep&&dep.name].filter(Boolean).join(' ').toLowerCase(); hit=hay.includes(q);}
    if(filter)hit=hit&&it.deptId===filter;
    if(vacantMode)hit=false;
    el.classList.toggle('hit',active&&hit); el.classList.toggle('dim',active&&!hit);
    if(hit&&!first&&active&&!q&&!vacantMode)first=it; });
  if(first&&(filter||vacantMode)&&!$('#q').value.trim())centerOn(first); }
function animateView(tx,ty,s,ms){ ms=ms||430; const s0={tx:view.tx,ty:view.ty,s:view.s}, t0=performance.now(); cancelAnimationFrame(view._raf);
  const step=now=>{ let k=Math.min(1,(now-t0)/ms); k=1-Math.pow(1-k,3); view.tx=s0.tx+(tx-s0.tx)*k; view.ty=s0.ty+(ty-s0.ty)*k; view.s=s0.s+(s-s0.s)*k; applyView(); if(k<1)view._raf=requestAnimationFrame(step); };
  view._raf=requestAnimationFrame(step); }
function centerOn(it){ const s=Math.max(view.s,1.05); const tx=wrap.clientWidth/2-(it.x+it.w/2)*s, ty=wrap.clientHeight/2-(it.y+it.h/2)*s; animateView(tx,ty,s); }
function applyView(){ stage.style.transform=`translate(${view.tx}px,${view.ty}px) scale(${view.s})`; }
function fit(){ const f=curFloor(); if(!f)return; const vw=wrap.clientWidth, vh=wrap.clientHeight; view.s=Math.min((vw-80)/f.w,(vh-80)/f.h,1.5); view.tx=(vw-f.w*view.s)/2; view.ty=(vh-f.h*view.s)/2; applyView(); }
let searchMatches=[], searchIdx=0;
function computeMatches(q){ q=(q||'').trim().toLowerCase(); if(!q)return []; const r=[];
  STATE.floors.forEach((f,fidx)=>{ STATE.items.forEach(it=>{ if(it.type!=='desk'||it.floorId!==f.id||!it.name)return; const dep=DBYID[it.deptId];
    if([it.name,it.title,dep&&dep.name].filter(Boolean).join(' ').toLowerCase().includes(q))r.push({fidx,id:it.id}); }); }); return r; }
function goMatch(){ if(!searchMatches.length)return; const m=searchMatches[searchIdx]; if(m.fidx!==fi)fi=m.fidx; render();
  const it=STATE.items.find(x=>x.id===m.id); if(it){ centerOn(it); const el=paper.querySelector(`[data-id="${m.id}"]`); if(el)el.classList.add('active'); }
  if(searchMatches.length>1)toast(`동명 ${searchMatches.length}명 중 ${searchIdx+1}번째 · ${curFloor().name} (Enter로 다음)`); }
$('#q').oninput=()=>{ searchMatches=computeMatches($('#q').value); searchIdx=0; if(searchMatches.length)goMatch(); else render(); };
$('#q').addEventListener('keydown',e=>{ if(e.key==='Enter' && searchMatches.length){ e.preventDefault(); searchIdx=(searchIdx+1)%searchMatches.length; goMatch(); } });
$('#fit').onclick=fit;

/* ── 팬/줌 + 편집 드래그 ── */
const ptrs=new Map(); let pinch=null;
wrap.addEventListener('pointercancel',e=>{ ptrs.delete(e.pointerId); if(ptrs.size<2)pinch=null; });
wrap.addEventListener('pointerdown',e=>{
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ptrs.size>=2){ const v=[...ptrs.values()],a=v[0],b=v[1]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2,s:view.s,tx:view.tx,ty:view.ty}; drag=null; wrap.classList.remove('grab'); return; }
  if(measMode){ if(e.button!==0)return; const hit=e.target.closest('[data-mi]');
    if(hit){ const mi=STATE.items.find(x=>x.id===hit.dataset.mi); const r=wrap.getBoundingClientRect(); const cp={x:(e.clientX-r.left-view.tx)/view.s,y:(e.clientY-r.top-view.ty)/view.s};
      const hz=mi?((mi.orient||'h')==='h'):true; const p0=mi?{x:mi.x,y:mi.y}:{x:0,y:0}, p1=mi?(hz?{x:mi.x+mi.w,y:mi.y}:{x:mi.x,y:mi.y+mi.h}):{x:0,y:0};
      const TOL=16/view.s, d0=Math.hypot(cp.x-p0.x,cp.y-p0.y), d1=Math.hypot(cp.x-p1.x,cp.y-p1.y); let sub='move'; if(d0<=TOL&&d0<=d1)sub='e0'; else if(d1<=TOL)sub='e1';
      drag={mode:'measEdit',id:hit.dataset.mi,sub,sx:e.clientX,sy:e.clientY,moved:false,ox:mi?mi.x:0,oy:mi?mi.y:0,ow:mi?mi.w:0,oh:mi?mi.h:0}; wrap.setPointerCapture(e.pointerId); return; }
    const r=wrap.getBoundingClientRect(); mstart={x:(e.clientX-r.left-view.tx)/view.s,y:(e.clientY-r.top-view.ty)/view.s}; drag={mode:'meas',sx:e.clientX,sy:e.clientY}; wrap.setPointerCapture(e.pointerId); return; }
  if(editMode && e.target.classList && e.target.classList.contains('rz')){
    const id=e.target.dataset.for, it=STATE.items.find(x=>x.id===id);
    if(it){ const d={mode:'resize',id,sx:e.clientX,sy:e.clientY,ow:it.w,oh:it.h,moved:false};
      if(it.type==='desk'){ deskDefaults(it); d.odn=it.dn||1; d.orient=it.orient; d.unit=(it.orient==='v'?it.h:it.w)/(it.dn||1); }
      drag=d; wrap.setPointerCapture(e.pointerId); }
    return;
  }
  const el=e.target.closest('.item');
  if(editMode && el){ const id=el.dataset.id;
    if(!e.shiftKey && !selected.has(id))selected.clear();
    selected.add(id); paintSel();
    drag={mode:'item',ids:[...selected],sx:e.clientX,sy:e.clientY,moved:false,orig:{}};
    selected.forEach(i=>{const o=STATE.items.find(x=>x.id===i); drag.orig[i]={x:o.x,y:o.y};});
    wrap.setPointerCapture(e.pointerId); return;
  }
  drag={mode:'pan',sx:e.clientX,sy:e.clientY,tx:view.tx,ty:view.ty,moved:false,el:(!editMode&&el&&el.classList.contains('desk'))?el:null};
  wrap.classList.add('grab'); wrap.setPointerCapture(e.pointerId);
  if(editMode && !el){ selected.clear(); paintSel(); }
});
wrap.addEventListener('pointermove',e=>{
  { const p=ptrs.get(e.pointerId); if(p){ p.x=e.clientX; p.y=e.clientY; } }
  if(pinch && ptrs.size>=2){ const v=[...ptrs.values()],a=v[0],b=v[1]; const d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2, r=wrap.getBoundingClientRect();
    const ns=clamp(pinch.s*(d/pinch.d),.15,3), cX=(pinch.mx-r.left-pinch.tx)/pinch.s, cY=(pinch.my-r.top-pinch.ty)/pinch.s;
    view.s=ns; view.tx=(mx-r.left)-cX*ns; view.ty=(my-r.top)-cY*ns; applyView(); if(measMode)drawMeas(); return; }
  if(!drag)return;
  if(drag.mode==='meas'){ const r=wrap.getBoundingClientRect(); const raw={x:(e.clientX-r.left-view.tx)/view.s,y:(e.clientY-r.top-view.ty)/view.s}; const b=segStraight(mstart,raw); mprev={a:mstart,b}; drawMeas({a:mstart,b}); return; }
  if(drag.mode==='measEdit'){ if(Math.abs(e.clientX-drag.sx)+Math.abs(e.clientY-drag.sy)>3)drag.moved=true;
    if(drag.moved){ const it=STATE.items.find(x=>x.id===drag.id); if(it){ const dx=(e.clientX-drag.sx)/view.s, dy=(e.clientY-drag.sy)/view.s, hz=(it.orient||'h')==='h';
      if(drag.sub==='move'){ it.x=snap(drag.ox+dx); it.y=snap(drag.oy+dy); }
      else if(drag.sub==='e1'){ if(hz)it.w=Math.max(4,snap(drag.ow+dx)); else it.h=Math.max(4,snap(drag.oh+dy)); }
      else { if(hz){ const end=drag.ox+drag.ow, nx=Math.min(snap(drag.ox+dx),end-4); it.x=nx; it.w=end-nx; } else { const end=drag.oy+drag.oh, ny=Math.min(snap(drag.oy+dy),end-4); it.y=ny; it.h=end-ny; } }
      drawMeas(); } } return; }
  if(Math.abs(e.clientX-drag.sx)+Math.abs(e.clientY-drag.sy)>3)drag.moved=true;
  if(drag.mode==='pan'){ view.tx=drag.tx+(e.clientX-drag.sx); view.ty=drag.ty+(e.clientY-drag.sy); applyView(); }
  else if(drag.mode==='resize'){ const it=STATE.items.find(x=>x.id===drag.id); if(!it)return;
    if(it.type==='desk'){ const ddw=(e.clientX-drag.sx)/view.s, ddh=(e.clientY-drag.sy)/view.s;
      const along=(drag.orient==='v'?drag.oh+ddh:drag.ow+ddw), unit=drag.unit||(drag.orient==='v'?drag.oh:drag.ow)||24;
      const dn=Math.max(1,Math.round(along/unit)); it.dn=dn;
      if(drag.orient==='v')it.h=Math.round(unit*dn); else it.w=Math.round(unit*dn);
      const del=paper.querySelector(`[data-id="${drag.id}"]`); if(del){ del.style.width=it.w+'px'; del.style.height=it.h+'px'; }
      moveHandle(it); tip.textContent=deskTip(it); tip.classList.add('on'); moveTip(e); return; }
    const dw=(e.clientX-drag.sx)/view.s, dh=(e.clientY-drag.sy)/view.s;
    const minW=it.type==='line'?4:24, minH=it.type==='line'?4:16;
    it.w=Math.max(minW,snap(drag.ow+dw)); it.h=Math.max(minH,snap(drag.oh+dh));
    if(it.type==='line'){ const th=it.thickness||6; if((it.orient||'h')==='h')it.h=th; else it.w=th; }
    if(it.type==='label'){ it.fontSize=clamp(Math.round(it.h*0.6),10,200); }
    const el=paper.querySelector(`[data-id="${drag.id}"]`); if(el){ el.style.width=it.w+'px'; el.style.height=it.h+'px'; if(it.type==='label')el.style.fontSize=it.fontSize+'px'; }
    moveHandle(it);
  }
  else{ const dx=(e.clientX-drag.sx)/view.s, dy=(e.clientY-drag.sy)/view.s;
    drag.ids.forEach(id=>{ const it=STATE.items.find(x=>x.id===id); it.x=snap(drag.orig[id].x+dx); it.y=snap(drag.orig[id].y+dy);
      const el=paper.querySelector(`[data-id="${id}"]`); if(el){el.style.left=it.x+'px'; el.style.top=it.y+'px';} });
    if(drag.ids.length===1){ const it=STATE.items.find(x=>x.id===drag.ids[0]); if(it)moveHandle(it); } }
});
wrap.addEventListener('pointerup',e=>{
  ptrs.delete(e.pointerId); if(ptrs.size<2)pinch=null;
  if(drag){
    if(drag.mode==='meas'){ if(mprev){ addMeas(mprev.a,mprev.b); mprev=null; } drawMeas(); wrap.classList.remove('grab'); drag=null; return; }
    if(drag.mode==='measEdit'){ if(drag.moved){ markDirty(); pushHist(); drawMeas(); } else editVal(drag.id); wrap.classList.remove('grab'); drag=null; return; }
    if(drag.mode==='item'){
      if(drag.moved){ drag.ids.forEach(id=>{ const it=STATE.items.find(x=>x.id===id); if(it&&it.type==='line')snapLine(it); }); markDirty(); pushHist(); render(); }
      else { const id=drag.ids[0], now=Date.now();  // 이동 없이 탭 → 더블탭이면 편집
        if(lastTap && lastTap.id===id && now-lastTap.t<350){ const it=STATE.items.find(x=>x.id===id); lastTap=null; if(it)editItem(it); }
        else lastTap={id,t:now}; }
    }
    if(drag.mode==='resize'){ const it=STATE.items.find(x=>x.id===drag.id); if(it&&it.type==='line')snapLine(it); tip.classList.remove('on'); markDirty(); pushHist(); render(); }
    if(drag.mode==='pan'&&!drag.moved&&drag.el){ const it=STATE.items.find(x=>x.id===drag.el.dataset.id); if(it){ if(it.name)openPanel(it.id); else openReserve(it); } }
  }
  wrap.classList.remove('grab'); drag=null; });
wrap.addEventListener('wheel',e=>{e.preventDefault(); const fac=e.deltaY<0?1.1:1/1.1, ns=clamp(view.s*fac,.22,2.8), r=wrap.getBoundingClientRect(); const cx=e.clientX-r.left,cy=e.clientY-r.top; view.tx=cx-(cx-view.tx)*(ns/view.s); view.ty=cy-(cy-view.ty)*(ns/view.s); view.s=ns; applyView(); if(measMode)drawMeas();},{passive:false});

function paintSel(){
  $$('.rz',paper).forEach(h=>h.remove());
  $$('.item',paper).forEach(el=>el.classList.toggle('sel',selected.has(el.dataset.id)));
  if(editMode && selected.size===1){ const it=STATE.items.find(x=>x.id===[...selected][0]);
    if(it){ const h=document.createElement('div'); h.className='rz'; h.dataset.for=it.id; h.style.left=(it.x+it.w-7)+'px'; h.style.top=(it.y+it.h-7)+'px'; paper.appendChild(h); } }
  $('#delSel').disabled=!selected.size;
}
function moveHandle(it){ const hn=paper.querySelector('.rz'); if(hn){ hn.style.left=(it.x+it.w-7)+'px'; hn.style.top=(it.y+it.h-7)+'px'; } }

/* ── 상세 패널 ── */
function openPanel(id){ const it=STATE.items.find(x=>x.id===id); if(!it||!it.name)return; activeId=id; tip.classList.remove('on');
  $$('.desk',paper).forEach(el=>el.classList.toggle('active',el.dataset.id===id)); const dep=DBYID[it.deptId]; const c=dep?dep.color:'#9aa1b0';
  $('#panel').innerHTML=`<div class="ph"><button class="close" id="pclose"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    <div class="bigav" style="--dc:${c}">${esc(initials(it.name))}</div><div class="pname">${esc(it.name)}</div><div class="pdept" style="--dc:${c}"><i></i>${esc(dep?dep.name:'—')}</div></div>
    <div class="meta"><div class="mrow"><span class="k">직급</span><span class="v">${esc(it.title||'—')}</span></div><div class="mrow"><span class="k">층</span><span class="v">${esc(curFloor().name)}</span></div>${it.seatNo?`<div class="mrow"><span class="k">좌석</span><span class="v">${esc(it.seatNo)}</span></div>`:''}</div>`;
  $('#pclose').onclick=closePanel; $('#panel').classList.add('on'); $('#panel').setAttribute('aria-hidden','false'); $('#scrim').classList.add('on'); }
function closePanel(){ activeId=null; $$('.desk',paper).forEach(el=>el.classList.remove('active')); $('#panel').classList.remove('on'); $('#panel').setAttribute('aria-hidden','true'); if($('#modalback').hidden)$('#scrim').classList.remove('on'); }

/* 좌석 사전 예약 (직원 셀프) */
function openReserve(it){
  const today=new Date().toISOString().slice(0,10);
  if(it.reserved){ const r=it.reserved;
    openModal(`<h3>예약된 자리</h3>
      <div style="padding:4px 0"><div style="font-size:20px;font-weight:800">${esc(r.name)}</div><div style="color:var(--muted);font-size:13px;margin-top:4px">${esc(r.dept||'')} · <b style="color:#c07f1a">${esc(r.from)}부터 사용 예정</b></div></div>
      <div style="margin:12px 0 0;padding:12px 14px;background:var(--line-2);border-radius:12px;font-size:12.5px;color:var(--muted)">이미 예약된 자리입니다.${editMode?'':' 취소는 관리자에게 요청하세요.'}</div>
      <div class="actions">${editMode?'<button class="btn danger" id="rv_cancel">예약 취소</button><span style="flex:1"></span>':''}<button class="btn primary" id="m_close">닫기</button></div>`);
    if(editMode)$('#rv_cancel').onclick=()=>{ if(!confirm('이 예약을 취소할까요?'))return; delete it.reserved; closeModal(); markDirty(); pushHist(); render(); toast('예약 취소됨 (저장 필요)'); };
    $('#m_close').onclick=closeModal; return; }
  const dl=[...new Set(STATE.employees.map(e=>e.name))].map(n=>`<option value="${esc(n)}">`).join('');
  const dd=STATE.depts.map(d=>`<option value="${esc(d.name)}">`).join('');
  openModal(`<h3>이 자리 예약하기</h3>
    <label>이름</label><input id="rv_name" list="rvnames" placeholder="이름" autocomplete="off"/><datalist id="rvnames">${dl}</datalist>
    <label>부서</label><input id="rv_dept" list="rvdepts" placeholder="부서 (선택)"/><datalist id="rvdepts">${dd}</datalist>
    <label>사용 시작일</label><input id="rv_from" type="date" min="${today}" value="${today}"/>
    <div class="actions"><button class="btn" id="m_cancel">취소</button><button class="btn primary" id="rv_ok">예약</button></div>`);
  $('#rv_name').oninput=()=>{ const e=STATE.employees.find(x=>x.name===$('#rv_name').value.trim()); if(e&&e.dept)$('#rv_dept').value=e.dept; };
  $('#m_cancel').onclick=closeModal;
  $('#rv_ok').onclick=async()=>{ const name=$('#rv_name').value.trim(), dept=$('#rv_dept').value.trim(), from=$('#rv_from').value;
    if(!name)return alert('이름을 입력하세요'); if(!from)return alert('사용 시작일을 선택하세요');
    let res,j; try{ res=await fetch('/api/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:it.id,name,dept,from})}); j=await res.json().catch(()=>({})); }catch(e){ return alert('예약 실패: 네트워크'); }
    if(res.status===409){ alert(j.reserved?`이미 ${j.reserved.name}님이 예약한 자리입니다.`:'이미 예약(또는 사용) 중인 자리입니다.'); closeModal(); STATE=await loadState(); refreshMaps(); render(); return; }
    if(!res.ok)return alert('예약 실패: '+(j.error||res.status));
    closeModal(); STATE=await loadState(); refreshMaps(); render(); toast(name+'님 · '+from+'부터 예약되었습니다'); };
}
$('#scrim').onclick=()=>{closePanel(); closeModal();};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ closePanel(); closeModal();
    if(measMode){ measMode=false; wrap.classList.remove('measuring'); $('#measBtn').classList.remove('on'); clearMeasure(); } }
  const typing=/input|select|textarea/i.test(e.target.tagName);
  const mod=e.ctrlKey||e.metaKey;
  if(mod && e.key.toLowerCase()==='s'){ e.preventDefault(); if(editMode)save(); return; }
  if(!editMode || !$('#modalback').hidden) return;   // 편집중 + 모달 안 열림일 때만
  if(mod && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); return; }
  if(mod && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if(mod && e.key.toLowerCase()==='c' && !typing){ e.preventDefault(); copySel(); return; }
  if(mod && e.key.toLowerCase()==='v' && !typing){ e.preventDefault(); pasteClip(); return; }
  if((e.key==='Delete'||e.key==='Backspace') && !typing){ e.preventDefault(); delSelected(); }
});

/* ── 모달 ── */
function openModal(html){ $('#modal').innerHTML=html; $('#modalback').hidden=false; $('#scrim').classList.add('on'); }
function closeModal(){ $('#modalback').hidden=true; $('#modal').innerHTML=''; $('#modal').classList.remove('wide'); if(!$('#panel').classList.contains('on'))$('#scrim').classList.remove('on'); }

/* ════════ 편집 모드 ════════ */
function markDirty(){ dirty=true; $('#dirty').hidden=false; }
async function enterEdit(){ const pw=prompt('관리자 비밀번호'); if(pw==null)return;
  try{ const r=await fetch('/api/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})}); if(!r.ok)throw 0; }
  catch{ alert('비밀번호가 올바르지 않습니다.'); return; }
  adminPw=pw; editMode=true; $('#editbar').hidden=false; $('#editBtn').textContent='보기'; wrap.classList.add('editing'); closePanel(); }
async function exitEdit(){ if(dirty && confirm('변경사항을 저장할까요?'))await save();
  editMode=false; $('#editbar').hidden=true; $('#udock').hidden=true; $('#editBtn').textContent='관리자 편집'; wrap.classList.remove('editing'); selected.clear(); paintSel(); }
$('#editBtn').onclick=()=>editMode?exitEdit():enterEdit();
$('#doneBtn').onclick=exitEdit;
$('#delSel').onclick=delSelected;
function delSelected(){ if(!selected.size)return; if(!confirm(selected.size+'개 요소를 삭제할까요?'))return;
  STATE.items=STATE.items.filter(i=>!selected.has(i.id)); selected.clear(); markDirty(); pushHist(); render(); }

/* 요소 추가 (좌석·시설·텍스트·선) */
function addItem(type){ const f=curFloor(); if(!f)return;
  const cx=snap((wrap.clientWidth/2-view.tx)/view.s), cy=snap((wrap.clientHeight/2-view.ty)/view.s);
  const it={id:uid(),floorId:f.id,type,x:cx,y:cy,z:type==='label'?3:type==='desk'?2:1};
  if(type==='desk')Object.assign(it,{w:80,h:68,name:'',deptId:(STATE.depts[0]||{}).id||null,title:'',seatNo:'',occupied:false});
  if(type==='facility')Object.assign(it,{w:70,h:60,label:'시설'});
  if(type==='label')Object.assign(it,{w:140,h:36,text:'텍스트',fontSize:16,bold:true});
  if(type==='line')Object.assign(it,{orient:'h',w:180,h:6,thickness:6,color:'#aab0bd',lineStyle:'solid'});
  STATE.items.push(it); markDirty(); pushHist(); render();
  selected.clear(); selected.add(it.id); paintSel();
  if(type==='desk')editDesk(it); else if(type==='facility')editFacility(it); else if(type==='label')editLabel(it);
}
$$('[data-add]').forEach(b=>b.onclick=()=>addItem(b.dataset.add));

/* 좌석 N×M 일괄 생성 */
$('#addPod').onclick=()=>{ const f=curFloor(); if(!f)return; const inp=prompt('가로 개수 × 세로 개수  예: 4x3','4x3'); if(!inp)return;
  const p=inp.toLowerCase().split(/[x×,\s]+/).map(Number); const cols=p[0]||1, rows=p[1]||1; if(cols<1||rows<1||cols*rows>300)return alert('1~300석 범위로 입력하세요');
  const cx=snap((wrap.clientWidth/2-view.tx)/view.s), cy=snap((wrap.clientHeight/2-view.ty)/view.s); const W=80,H=68,GX=8,GY=8, dep=(STATE.depts[0]||{}).id||null;
  selected.clear();
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){ const it={id:uid(),floorId:f.id,type:'desk',x:cx+c*(W+GX),y:cy+r*(H+GY),w:W,h:H,name:'',deptId:dep,title:'',seatNo:'',occupied:false,z:2}; STATE.items.push(it); selected.add(it.id); }
  markDirty(); pushHist(); render(); paintSel(); toast(cols*rows+'석 생성'); };

/* 선택 정렬 · 균등배분 */
$('#alignBtn').onclick=()=>{ if(selected.size<2)return toast('2개 이상 선택하세요');
  openModal(`<h3>정렬 · 배분 <span style="font-size:12px;color:var(--muted);font-weight:600">· ${selected.size}개</span></h3>
    <div class="alnrow"><button class="btn sm" data-al="left">⬅ 왼쪽</button><button class="btn sm" data-al="hcenter">↔ 가운데</button><button class="btn sm" data-al="right">➡ 오른쪽</button></div>
    <div class="alnrow"><button class="btn sm" data-al="top">⬆ 위</button><button class="btn sm" data-al="vcenter">↕ 가운데</button><button class="btn sm" data-al="bottom">⬇ 아래</button></div>
    <div class="alnrow"><button class="btn sm" data-al="disth">↔ 가로 균등배분</button><button class="btn sm" data-al="distv">↕ 세로 균등배분</button></div>
    <div class="actions"><button class="btn primary" id="m_close">닫기</button></div>`);
  $$('[data-al]',$('#modal')).forEach(b=>b.onclick=()=>alignSel(b.dataset.al)); $('#m_close').onclick=closeModal; };
function alignSel(mode){ const its=[...selected].map(id=>STATE.items.find(x=>x.id===id)).filter(Boolean); if(its.length<2)return;
  const L=Math.min(...its.map(i=>i.x)),R=Math.max(...its.map(i=>i.x+i.w)),T=Math.min(...its.map(i=>i.y)),B=Math.max(...its.map(i=>i.y+i.h)),CX=(L+R)/2,CY=(T+B)/2;
  if(mode==='left')its.forEach(i=>i.x=Math.round(L)); if(mode==='right')its.forEach(i=>i.x=Math.round(R-i.w)); if(mode==='hcenter')its.forEach(i=>i.x=Math.round(CX-i.w/2));
  if(mode==='top')its.forEach(i=>i.y=Math.round(T)); if(mode==='bottom')its.forEach(i=>i.y=Math.round(B-i.h)); if(mode==='vcenter')its.forEach(i=>i.y=Math.round(CY-i.h/2));
  if(mode==='disth'){ const s=its.slice().sort((a,b)=>a.x-b.x); const mn=s[0].x,mx=s[s.length-1].x,st=(mx-mn)/(s.length-1); s.forEach((i,k)=>i.x=Math.round(mn+st*k)); }
  if(mode==='distv'){ const s=its.slice().sort((a,b)=>a.y-b.y); const mn=s[0].y,mx=s[s.length-1].y,st=(mx-mn)/(s.length-1); s.forEach((i,k)=>i.y=Math.round(mn+st*k)); }
  markDirty(); pushHist(); render(); paintSel(); }

/* 층 복제 */
function dupFloor(){ const f=curFloor(); if(!f)return; const nf={id:uid(),name:f.name+' 복사',w:f.w,h:f.h}; if(f.mX)nf.mX=f.mX; if(f.mY)nf.mY=f.mY; STATE.floors.push(nf);
  STATE.items.filter(i=>i.floorId===f.id).forEach(i=>STATE.items.push({...i,id:uid(),floorId:nf.id}));
  markDirty(); pushHist(); tabs(); toast(f.name+' 복제됨'); }

/* 백업 복원 */
$('#restoreBtn').onclick=openBackups;
async function openBackups(){ let idx=[]; try{ idx=((await fetch('/api/backups',{cache:'no-store'}).then(r=>r.json()))||{}).backups||[]; }catch(e){}
  openModal(`<h3>백업 복원 <span style="font-size:12px;color:var(--muted);font-weight:600">· ${idx.length}개</span></h3>`+
    (idx.length?`<div class="baklist">${idx.map(t=>`<div class="bakrow"><span>${new Date(t).toLocaleString('ko-KR')}</span><button class="btn sm" data-t="${t}">이 시점으로 복원</button></div>`).join('')}</div>`:'<div style="padding:20px;text-align:center;color:var(--faint);font-size:13px">백업 없음 (저장할 때마다 자동 생성됩니다)</div>')+
    `<div class="actions"><button class="btn primary" id="m_close">닫기</button></div>`);
  $$('.bakrow button',$('#modal')).forEach(b=>b.onclick=async()=>{ if(!confirm('이 시점으로 되돌릴까요? (현재 상태도 백업됩니다)'))return;
    const r=await fetch('/api/backups',{method:'POST',headers:{'Content-Type':'application/json','x-edit-pass':adminPw},body:JSON.stringify({t:+b.dataset.t})});
    if(r.status===401)return alert('편집 권한이 없습니다.'); if(!r.ok)return alert('복원 실패');
    closeModal(); STATE=await loadState(); refreshMaps(); dirty=false; $('#dirty').hidden=true; fi=Math.min(fi,STATE.floors.length-1); tabs(); render(); fit(); pushHist(); toast('복원되었습니다'); });
  $('#m_close').onclick=closeModal; }

/* 선 끝점 스냅: 가까운 다른 선의 축/끝점에 붙여 코너를 맞물리게 */
function snapLine(it){ if(it.type!=='line')return; const TOL=14, horiz=(it.orient||'h')==='h';
  const others=STATE.items.filter(i=>i.type==='line'&&i.floorId===it.floorId&&i!==it);
  const X=[], Y=[]; others.forEach(o=>{ const oh=(o.orient||'h')==='h'; if(oh){ Y.push(o.y+o.h/2); X.push(o.x); X.push(o.x+o.w); } else { X.push(o.x+o.w/2); Y.push(o.y); Y.push(o.y+o.h); } });
  const near=(v,arr)=>{ let b=null,d=TOL+1; arr.forEach(a=>{const dd=Math.abs(a-v); if(dd<d){d=dd;b=a;}}); return b; };
  if(horiz){ const ny=near(it.y+it.h/2,Y); if(ny!=null)it.y=Math.round(ny-it.h/2);
    const n1=near(it.x,X); if(n1!=null){ it.w=Math.round(it.w+(it.x-n1)); it.x=Math.round(n1); }
    const n2=near(it.x+it.w,X); if(n2!=null)it.w=Math.round(n2-it.x); }
  else { const nx=near(it.x+it.w/2,X); if(nx!=null)it.x=Math.round(nx-it.w/2);
    const m1=near(it.y,Y); if(m1!=null){ it.h=Math.round(it.h+(it.y-m1)); it.y=Math.round(m1); }
    const m2=near(it.y+it.h,Y); if(m2!=null)it.h=Math.round(m2-it.y); }
  if(it.w<2)it.w=2; if(it.h<2)it.h=2; }
function editItem(it){ if(it.type==='desk'){ if(it.reserved&&!it.name)openReserve(it); else editDesk(it); } else if(it.type==='facility')editFacility(it); else if(it.type==='label')editLabel(it); else if(it.type==='line')editLine(it); }

function editFacility(it){
  openModal(`<h3>시설</h3><label>이름 (아이콘 자동 적용)</label><input id="f_lbl" value="${esc(it.label||'')}" placeholder="예: 복합기 · 화장실 · 계단 · 탕비실"/>
    <div class="row2"><div><label>가로</label><input id="f_w" type="number" value="${it.w}"/></div><div><label>세로</label><input id="f_h" type="number" value="${it.h}"/></div></div>
    <div class="actions"><button class="btn" id="x_cancel">취소</button><button class="btn primary" id="x_ok">확인</button></div>`);
  $('#x_cancel').onclick=closeModal;
  $('#x_ok').onclick=()=>{ it.label=$('#f_lbl').value.trim(); it.w=+$('#f_w').value||it.w; it.h=+$('#f_h').value||it.h; closeModal(); markDirty(); pushHist(); render(); };
}
function editLabel(it){
  openModal(`<h3>텍스트</h3><label>내용</label><input id="t_txt" value="${esc(it.text||'')}"/>
    <div class="row2"><div><label>글자 크기</label><input id="t_fs" type="number" value="${it.fontSize||16}"/></div>
    <div><label>굵기</label><select id="t_b"><option value="1" ${it.bold?'selected':''}>굵게</option><option value="0" ${!it.bold?'selected':''}>보통</option></select></div></div>
    <div class="actions"><button class="btn" id="x_cancel">취소</button><button class="btn primary" id="x_ok">확인</button></div>`);
  $('#x_cancel').onclick=closeModal;
  $('#x_ok').onclick=()=>{ it.text=$('#t_txt').value; it.fontSize=+$('#t_fs').value||16; it.bold=$('#t_b').value==='1'; closeModal(); markDirty(); pushHist(); render(); };
}
function editLine(it){
  const horiz=(it.orient||'h')==='h', len=horiz?it.w:it.h;
  openModal(`<h3>선 / 벽</h3>
    <div class="row2"><div><label>방향</label><select id="l_o"><option value="h" ${horiz?'selected':''}>가로</option><option value="v" ${!horiz?'selected':''}>세로</option></select></div>
    <div><label>길이</label><input id="l_len" type="number" value="${len}"/></div></div>
    <div class="row2"><div><label>두께</label><input id="l_th" type="number" value="${it.thickness||6}"/></div>
    <div><label>색상</label><input id="l_c" type="color" value="${(it.color&&it.color[0]==='#')?it.color:'#aab0bd'}"/></div></div>
    <div class="actions"><button class="btn" id="x_cancel">취소</button><button class="btn primary" id="x_ok">확인</button></div>`);
  $('#x_cancel').onclick=closeModal;
  $('#x_ok').onclick=()=>{ const o=$('#l_o').value, L=+$('#l_len').value||len, th=+$('#l_th').value||6;
    it.orient=o; it.thickness=th; it.color=$('#l_c').value; if(o==='h'){it.w=L;it.h=th;}else{it.w=th;it.h=L;}
    closeModal(); markDirty(); pushHist(); render(); };
}

/* 되돌리기 / 다시실행 / 복사 / 붙여넣기 */
let history=[], hi=-1, clip=[];
function pushHist(){ history=history.slice(0,hi+1); history.push(JSON.stringify(STATE)); if(history.length>60)history.shift(); hi=history.length-1; updUndo(); }
function updUndo(){ const u=$('#undoBtn'),r=$('#redoBtn'); if(u)u.disabled=hi<=0; if(r)r.disabled=hi>=history.length-1; }
function restore(i){ hi=i; STATE=JSON.parse(history[hi]); refreshMaps(); selected.clear(); markDirty(); render(); updUndo(); }
function undo(){ if(hi>0)restore(hi-1); }
function redo(){ if(hi<history.length-1)restore(hi+1); }
function copySel(){ if(!selected.size)return; clip=[...selected].map(id=>STATE.items.find(x=>x.id===id)).filter(Boolean).map(o=>JSON.parse(JSON.stringify(o))); toast(clip.length+'개 복사됨'); }
function pasteClip(){ if(!clip.length)return; selected.clear();
  clip.forEach(c=>{ const it=JSON.parse(JSON.stringify(c)); it.id=uid(); it.floorId=curId(); it.x=snap(it.x+24); it.y=snap(it.y+24);
    if(it.type==='desk'){ it.name=''; it.title=''; it.occupied=false; } STATE.items.push(it); selected.add(it.id); });
  markDirty(); pushHist(); render(); paintSel(); toast(clip.length+'개 붙여넣기'); }
if($('#undoBtn'))$('#undoBtn').onclick=undo; if($('#redoBtn'))$('#redoBtn').onclick=redo;

function editDesk(it){
  const opts=STATE.depts.map(d=>`<option value="${d.id}" ${d.id===it.deptId?'selected':''}>${esc(d.name)}</option>`).join('');
  const dl=[...new Set(STATE.employees.map(e=>e.name))].map(n=>`<option value="${esc(n)}">`).join('');
  openModal(`<h3>좌석 정보</h3>
    <label>이름 (명단 자동완성 · 비우면 공석)</label>
    <input id="m_name" list="empdl" value="${esc(it.name||'')}" placeholder="예: 홍길동" autocomplete="off"/>
    <datalist id="empdl">${dl}</datalist>
    <div class="row2"><div><label>부서</label><select id="m_dept">${opts}</select></div>
    <div><label>직급</label><input id="m_title" value="${esc(it.title||'')}"/></div></div>
    <label>좌석번호</label><input id="m_seat" value="${esc(it.seatNo||'')}"/>
    <div class="row2"><div><label>방향</label><select id="m_orient"><option value="h" ${it.orient!=='v'?'selected':''}>가로형 (긴변 →)</option><option value="v" ${it.orient==='v'?'selected':''}>세로형 (긴변 ↓)</option></select></div>
    <div><label>책상 수</label><input id="m_dn" type="number" min="1" step="1" value="${it.dn||1}"/></div></div>
    <div class="row2"><div><label>책상 가로(mm)</label><input id="m_mmU" type="number" min="1" value="${it.mmU||1400}"/></div>
    <div><label>깊이 세로(mm)</label><input id="m_mmD" type="number" min="1" value="${it.mmD||700}"/></div></div>
    <div class="arealine" id="m_area"></div>
    <div class="actions"><button class="btn danger" id="m_empty">비우기(공석)</button><span style="flex:1"></span><button class="btn" id="m_cancel">취소</button><button class="btn primary" id="m_ok">확인</button></div>`);
  const nm=$('#m_name'), dp=$('#m_dept'), tt=$('#m_title');
  const updArea=()=>{ const o=$('#m_orient').value, dn=Math.max(1,+$('#m_dn').value||1), u=+$('#m_mmU').value||1400, dd=+$('#m_mmD').value||700; const L=u*dn, W=o==='v'?dd:L, H=o==='v'?L:dd, a=W*H/1e6; $('#m_area').innerHTML=`총 <b>${W} × ${H}mm</b> · <b>${a.toFixed(2)}㎡</b> · ${(a/3.3058).toFixed(2)}평`; };
  ['m_orient','m_dn','m_mmU','m_mmD'].forEach(id=>{ const el=$('#'+id); if(el){ el.oninput=updArea; el.onchange=updArea; } }); updArea();
  nm.oninput=()=>{ const e=STATE.employees.find(x=>x.name===nm.value.trim()); if(e){ const d=DBYNAME[e.dept]; if(d)dp.value=d.id; if(e.rank)tt.value=e.rank; } };
  $('#m_cancel').onclick=closeModal;
  $('#m_empty').onclick=()=>{ it.name=''; it.title=''; it.occupied=false; closeModal(); markDirty(); pushHist(); render(); };
  $('#m_ok').onclick=()=>{ it.name=nm.value.trim(); it.deptId=dp.value||null; it.title=tt.value.trim(); it.seatNo=$('#m_seat').value.trim(); it.occupied=!!it.name;
    setDeskSize(it,$('#m_orient').value,Math.max(1,+$('#m_dn').value||1),+$('#m_mmU').value||1400,+$('#m_mmD').value||700);
    closeModal(); markDirty(); pushHist(); render(); };
}

/* ── 면적 · 부서별 비용 집계 (재무) ── */
function openAreaReport(){ const M2PY=3.3058;
  const rows={}; let tArea=0,tCnt=0,tSeat=0;
  STATE.items.filter(i=>i.type==='desk').forEach(it=>{ const k=it.deptId||'__none', a=deskArea(it);
    if(!rows[k])rows[k]={area:0,cnt:0,seated:0}; rows[k].area+=a; rows[k].cnt++; if(it.name)rows[k].seated++; tArea+=a; tCnt++; if(it.name)tSeat++; });
  const list=Object.entries(rows).map(([k,v])=>({name:k==='__none'?'(부서 미지정)':(DBYID[k]?DBYID[k].name:'(삭제된 부서)'),color:DBYID[k]?DBYID[k].color:'#9aa1b0',...v})).sort((a,b)=>b.area-a.area);
  const body=list.map(r=>{ const pct=tArea?r.area/tArea*100:0;
    return `<tr><td><span class="ldot" style="background:${r.color}"></span>${esc(r.name)}</td><td>${r.seated}/${r.cnt}</td><td>${r.area.toFixed(2)}</td><td>${(r.area/M2PY).toFixed(2)}</td><td>${pct.toFixed(1)}%</td><td class="cost" data-pct="${pct}">–</td></tr>`; }).join('');
  openModal(`<h3>면적 · 부서별 비용 집계</h3>
    <div class="arow"><label style="flex:1">총 비용 (임대료·관리비 등, 원)</label><input id="a_total" type="number" placeholder="예: 30000000" style="width:170px"/></div>
    <div class="atbl-wrap"><table class="atbl"><thead><tr><th>부서</th><th>좌석<span style="font-weight:400">(재석/전체)</span></th><th>면적㎡</th><th>평</th><th>비율</th><th>배분비용</th></tr></thead>
    <tbody>${body||'<tr><td colspan="6" style="text-align:center;color:var(--muted)">좌석 없음</td></tr>'}</tbody>
    <tfoot><tr><th>합계</th><th>${tSeat}/${tCnt}</th><th>${tArea.toFixed(2)}</th><th>${(tArea/M2PY).toFixed(2)}</th><th>100%</th><th id="a_tcost">–</th></tr></tfoot></table></div>
    <div class="fnote">· 면적은 좌석 실치수(기본 1400×700mm) 기준이며 도면 축척과 무관하게 정확합니다. 방향(가로/세로)은 면적에 영향 없음. · 1평 = 3.3058㎡</div>
    <div class="actions"><button class="btn" id="a_csv">⬇ CSV</button><span style="flex:1"></span><button class="btn primary" id="a_close">닫기</button></div>`);
  $('#modal').classList.add('wide');
  const calc=()=>{ const tot=+$('#a_total').value||0; $$('.atbl .cost').forEach(td=>{ const p=+td.dataset.pct||0; td.textContent=tot?Math.round(tot*p/100).toLocaleString():'–'; }); $('#a_tcost').textContent=tot?Math.round(tot).toLocaleString():'–'; };
  $('#a_total').oninput=calc; $('#a_close').onclick=closeModal;
  $('#a_csv').onclick=()=>{ const tot=+$('#a_total').value||0; let csv='부서,재석,전체좌석,면적(㎡),면적(평),비율(%),배분비용(원)\n';
    list.forEach(r=>{ const pct=tArea?r.area/tArea*100:0; csv+=`${r.name},${r.seated},${r.cnt},${r.area.toFixed(2)},${(r.area/M2PY).toFixed(2)},${pct.toFixed(1)},${tot?Math.round(tot*pct/100):''}\n`; });
    csv+=`합계,${tSeat},${tCnt},${tArea.toFixed(2)},${(tArea/M2PY).toFixed(2)},100,${tot?Math.round(tot):''}\n`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})); a.download='부서별_면적_비용.csv'; a.click(); };
}
if($('#areaBtn'))$('#areaBtn').onclick=openAreaReport;

/* 임직원 관리 (입사 · 퇴사 · 수정 · 정렬) */
$('#mgrEmp').onclick=manageEmp;
const PENCIL='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
function manageEmp(){
  let sortKey='name', sortDir=1, editingId=null, mode='view', query=''; const sel=new Set();
  const M=()=>$('#modal');
  const dOpt=(s,extra)=>(extra?`<option value="">${extra}</option>`:'')+STATE.depts.map(d=>`<option value="${esc(d.name)}" ${d.name===s?'selected':''}>${esc(d.name)}</option>`).join('');
  openModal(`<h3>임직원 관리 <span class="cnt" style="font-size:12px;color:var(--muted);font-weight:600">· ${STATE.employees.length}명</span></h3>
    <div class="empbar"><input id="e_search" type="search" placeholder="이름 검색" autocomplete="off"/><button class="btn sm" id="mAdd">＋ 추가</button><button class="btn sm" id="mEdit">✎ 수정</button><button class="btn sm" id="csvExp" title="CSV 내보내기">⬇ CSV</button><button class="btn sm" id="csvImp" title="CSV 가져오기">⬆ CSV</button><input id="csvFile" type="file" accept=".csv,.txt" hidden/></div>
    <div id="addPanel" hidden><div class="emphead"><input id="e_name" placeholder="이름"/><select id="e_dept">${dOpt('')}</select><input id="e_rank" placeholder="직급 (예: GM)"/><button class="btn primary" id="e_add">추가</button></div></div>
    <div id="editPanel" hidden><div class="bulkbox">
      <div class="bulkrow"><b>직급 변경</b><input id="rk_from" placeholder="현재 예:GM"/> → <input id="rk_to" placeholder="변경 예:책임"/><button class="btn sm" id="rk_apply">일괄 적용</button></div>
      <div class="bulkrow"><b>부서 변경</b><select id="dp_from">${dOpt('','전체')}</select> → <select id="dp_to">${dOpt('')}</select><button class="btn sm" id="dp_apply">일괄 적용</button></div>
      <div class="bulkrow"><b>선택 항목</b><label style="display:flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" id="chkAll"/>전체</label><span id="selCnt" style="color:var(--accent);font-weight:800">0명</span><select id="sel_dept"><option value="">부서 유지</option>${dOpt('')}</select><input id="sel_rank" placeholder="직급 유지"/><button class="btn sm" id="sel_apply" disabled>적용</button><button class="btn sm danger" id="sel_del" disabled>삭제</button></div>
    </div></div>
    <div class="sortbar" id="sortbar"><span style="font-size:11px;color:var(--faint);font-weight:800;letter-spacing:.1em">정렬</span>
      <button data-k="name">이름 <i></i></button><button data-k="dept">부서 <i></i></button><button data-k="rank">직급 <i></i></button></div>
    <div class="emplist" id="emplist"></div>
    <div class="actions"><button class="btn primary" id="m_close">닫기</button></div>`);
  M().classList.add('wide');
  const cmp=(a,b)=>String(a[sortKey]||'').localeCompare(String(b[sortKey]||''),'ko')*sortDir || a.name.localeCompare(b.name,'ko');
  const setCnt=()=>{ const s=M().querySelector('h3 .cnt'); if(s)s.textContent='· '+STATE.employees.length+'명'; };
  const syncSeats=()=>{ const by={}; STATE.employees.forEach(e=>by[e.name]=e);
    STATE.items.forEach(i=>{ if(i.type==='desk'&&i.name&&by[i.name]){ const e=by[i.name]; i.title=e.rank||''; const d=DBYNAME[e.dept]; if(d)i.deptId=d.id; } }); };
  const updSel=()=>{ const n=sel.size, all=list().length; const sc=$('#selCnt'); if(sc)sc.textContent=n+'명'; const a=$('#sel_apply'),d=$('#sel_del'); if(a)a.disabled=!n; if(d)d.disabled=!n;
    const ca=$('#chkAll'); if(ca){ ca.checked=n>0&&n>=all; ca.indeterminate=n>0&&n<all; } };
  function commit(){ markDirty(); pushHist(); setCnt(); draw(); render(); }
  function list(){ const q=query.trim().toLowerCase(); return STATE.employees.filter(e=>!q||(e.name||'').toLowerCase().includes(q)).sort(cmp); }
  function draw(){
    $$('#sortbar button').forEach(b=>{ const on=b.dataset.k===sortKey; b.classList.toggle('on',on); b.querySelector('i').textContent=on?(sortDir>0?'▲':'▼'):''; });
    const edit=mode==='edit';
    $('#emplist').innerHTML=(list().map(e=> (edit&&e.id===editingId)
      ? `<div class="emprow editing" data-id="${e.id}"><input class="en2" value="${esc(e.name)}"/><select class="ed2">${dOpt(e.dept)}</select><input class="er2" value="${esc(e.rank||'')}" placeholder="직급"/><span class="ops"><button class="save" title="저장">✔</button><button class="cancel" title="취소">✕</button></span></div>`
      : edit
      ? `<div class="emprow" data-id="${e.id}"><input type="checkbox" class="chk" ${sel.has(e.id)?'checked':''}/><span class="en">${esc(e.name)}</span><span class="ed">${esc(e.dept||'')}</span><span class="er">${esc(e.rank||'')}</span><span class="ops"><button class="edit" title="수정">${PENCIL}</button><button class="rm" title="삭제">✕</button></span></div>`
      : `<div class="emprow" data-id="${e.id}"><span class="en">${esc(e.name)}</span><span class="ed">${esc(e.dept||'')}</span><span class="er">${esc(e.rank||'')}</span></div>`).join(''))
      || '<div style="padding:18px;text-align:center;color:var(--faint);font-size:13px">결과 없음</div>';
    if(edit)bindRows(); updSel();
  }
  function bindRows(){ const m=M();
    $$('#emplist .chk',m).forEach(c=>c.onchange=()=>{ const id=c.closest('.emprow').dataset.id; c.checked?sel.add(id):sel.delete(id); updSel(); });
    $$('#emplist .edit',m).forEach(b=>b.onclick=()=>{ editingId=b.closest('.emprow').dataset.id; draw(); });
    $$('#emplist .cancel',m).forEach(b=>b.onclick=()=>{ editingId=null; draw(); });
    $$('#emplist .rm',m).forEach(b=>b.onclick=()=>{ const id=b.closest('.emprow').dataset.id; const emp=STATE.employees.find(x=>x.id===id);
      if(emp&&confirm(`'${emp.name}' 삭제(퇴사)할까요? 좌석도 비워집니다.`)){ STATE.items.forEach(i=>{if(i.type==='desk'&&i.name===emp.name){i.name='';i.title='';i.occupied=false;}}); STATE.employees=STATE.employees.filter(x=>x.id!==id); sel.delete(id); commit(); } });
    $$('#emplist .save',m).forEach(b=>b.onclick=()=>{ const row=b.closest('.emprow'); const emp=STATE.employees.find(x=>x.id===row.dataset.id); if(!emp)return;
      const oldName=emp.name, nn=row.querySelector('.en2').value.trim()||emp.name, nd=row.querySelector('.ed2').value, nr=row.querySelector('.er2').value.trim();
      STATE.items.forEach(i=>{ if(i.type==='desk'&&i.name===oldName)i.name=nn; }); emp.name=nn; emp.dept=nd; emp.rank=nr; editingId=null; syncSeats(); commit(); });
  }
  function setMode(m){ mode=(mode===m?'view':m); editingId=null; if(mode!=='edit')sel.clear();
    $('#addPanel').hidden=mode!=='add'; $('#editPanel').hidden=mode!=='edit';
    $('#mAdd').classList.toggle('on2',mode==='add'); $('#mEdit').classList.toggle('on2',mode==='edit');
    draw(); if(mode==='add')setTimeout(()=>{const el=$('#e_name'); if(el)el.focus();},0); }
  $('#e_search').oninput=e=>{ query=e.target.value; draw(); };
  $('#mAdd').onclick=()=>setMode('add'); $('#mEdit').onclick=()=>setMode('edit');
  $$('#sortbar button').forEach(b=>b.onclick=()=>{ const k=b.dataset.k; if(sortKey===k)sortDir=-sortDir; else{sortKey=k;sortDir=1;} draw(); });
  $('#e_add').onclick=()=>{ const n=$('#e_name').value.trim(); if(!n){$('#e_name').focus();return;}
    STATE.employees.push({id:uid(),name:n,dept:$('#e_dept').value,rank:$('#e_rank').value.trim()}); $('#e_name').value=''; $('#e_rank').value=''; commit(); $('#e_name').focus(); };
  $('#rk_apply').onclick=()=>{ const f=$('#rk_from').value.trim(), t=$('#rk_to').value.trim(); if(!f){$('#rk_from').focus();return;}
    let c=0; STATE.employees.forEach(e=>{ if((e.rank||'')===f){e.rank=t; c++;} }); if(!c)return toast('해당 직급 없음'); syncSeats(); commit(); toast(`${c}명 직급 ${f}→${t||'(빈값)'}`); };
  $('#dp_apply').onclick=()=>{ const f=$('#dp_from').value, t=$('#dp_to').value; let c=0;
    STATE.employees.forEach(e=>{ if(f===''||e.dept===f){e.dept=t; c++;} }); if(!c)return toast('대상 없음'); syncSeats(); commit(); toast(`${c}명 부서 → ${t}`); };
  $('#chkAll').onchange=()=>{ sel.clear(); if($('#chkAll').checked)list().forEach(e=>sel.add(e.id)); draw(); };
  $('#sel_apply').onclick=()=>{ if(!sel.size)return; const d=$('#sel_dept').value, r=$('#sel_rank').value.trim();
    STATE.employees.forEach(e=>{ if(sel.has(e.id)){ if(d)e.dept=d; if(r)e.rank=r; } }); syncSeats(); commit(); toast(sel.size+'명 적용'); };
  $('#sel_del').onclick=()=>{ if(!sel.size||!confirm(sel.size+'명 삭제(퇴사)할까요?'))return;
    const names=new Set(STATE.employees.filter(e=>sel.has(e.id)).map(e=>e.name));
    STATE.items.forEach(i=>{ if(i.type==='desk'&&names.has(i.name)){i.name='';i.title='';i.occupied=false;} });
    STATE.employees=STATE.employees.filter(e=>!sel.has(e.id)); sel.clear(); commit(); };
  $('#csvExp').onclick=()=>{ const csv='이름,부서,직급\n'+STATE.employees.map(e=>[e.name,e.dept||'',e.rank||''].map(v=>/[",\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v).join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})); a.download='임직원명단.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); };
  $('#csvImp').onclick=()=>$('#csvFile').click();
  $('#csvFile').onchange=ev=>{ const file=ev.target.files[0]; ev.target.value=''; if(!file)return; const rd=new FileReader();
    rd.onload=()=>{ const txt=String(rd.result).replace(/^﻿/,''); const lines=txt.split(/\r?\n/).filter(l=>l.trim()); let st=0; if(lines[0]&&/이름/.test(lines[0]))st=1;
      const emps=[]; for(let i=st;i<lines.length;i++){ const c=lines[i].split(','); const nm=(c[0]||'').replace(/^"|"$/g,'').trim(); if(!nm)continue; emps.push({id:uid(),name:nm,dept:(c[1]||'').replace(/^"|"$/g,'').trim(),rank:(c[2]||'').replace(/^"|"$/g,'').trim()}); }
      if(!emps.length)return toast('가져올 데이터 없음'); if(!confirm(`${emps.length}명으로 명단을 교체할까요? (기존 명단 대체)`))return;
      STATE.employees=emps; syncSeats(); commit(); toast(emps.length+'명 가져옴'); };
    rd.readAsText(file,'utf-8'); };
  $('#m_close').onclick=closeModal;
  draw();
}

/* 부서 관리 */
$('#mgrDept').onclick=manageDept;
function manageDept(){
  const old=Object.fromEntries(STATE.depts.map(d=>[d.id,d.name]));
  const row=d=>`<div class="deprow" data-id="${d.id}"><input type="color" class="dc" value="${(d.color&&d.color[0]==='#')?d.color:'#3651d4'}"/><input type="text" class="dn" value="${esc(d.name||'')}"/><button class="rm" title="삭제">✕</button></div>`;
  openModal(`<h3>부서 관리</h3><div class="deplist" id="deplist">${STATE.depts.map(row).join('')}</div>
    <button class="btn sm" id="dp_add" style="margin-top:8px">＋ 부서 추가</button>
    <div class="actions"><button class="btn" id="m_cancel">취소</button><button class="btn primary" id="m_ok">저장</button></div>`);
  const bindRm=()=>$$('#deplist .rm',$('#modal')).forEach(b=>b.onclick=()=>b.closest('.deprow').remove());
  bindRm();
  $('#dp_add').onclick=()=>{ const div=document.createElement('div'); div.className='deprow'; div.dataset.id='n'+uid();
    div.innerHTML=`<input type="color" class="dc" value="#16a34a"/><input type="text" class="dn" value="새 부서"/><button class="rm">✕</button>`; $('#deplist').appendChild(div); bindRm(); div.querySelector('.dn').focus(); };
  $('#m_cancel').onclick=closeModal;
  $('#m_ok').onclick=()=>{ const nd=$$('#deplist .deprow',$('#modal')).map(r=>({id:r.dataset.id,name:r.querySelector('.dn').value.trim()||'부서',color:r.querySelector('.dc').value}));
    const ids=new Set(nd.map(d=>d.id));
    nd.forEach(d=>{ const on=old[d.id]; if(on&&on!==d.name)STATE.employees.forEach(e=>{if(e.dept===on)e.dept=d.name;}); });
    STATE.items.forEach(i=>{ if(i.type==='desk'&&i.deptId&&!ids.has(i.deptId))i.deptId=null; });
    STATE.depts=nd; refreshMaps(); closeModal(); markDirty(); pushHist(); render(); };
}
/* 층 관리 */
$('#mgrFloor').onclick=manageFloor;
function manageFloor(){
  const row=f=>`<div class="flrow" data-id="${f.id}"><input class="fn" value="${esc(f.name||'')}"/><input class="fw" type="number" value="${f.w}"/><span>×</span><input class="fh" type="number" value="${f.h}"/><button class="rm" title="삭제">✕</button></div>`;
  openModal(`<h3>층 관리</h3><div class="flrlist" id="flrlist">${STATE.floors.map(row).join('')}</div>
    <button class="btn sm" id="fl_add" style="margin-top:8px">＋ 층 추가</button>
    <button class="btn sm" id="fl_dup" style="margin-top:8px">📄 현재 층 복제</button>
    <div class="actions"><button class="btn" id="m_cancel">취소</button><button class="btn primary" id="m_ok">저장</button></div>`);
  const bindRm=()=>$$('#flrlist .rm',$('#modal')).forEach(b=>b.onclick=()=>{ if($$('#flrlist .flrow',$('#modal')).length<=1)return alert('최소 1개 층이 필요합니다.'); b.closest('.flrow').remove(); });
  bindRm();
  $('#fl_add').onclick=()=>{ const div=document.createElement('div'); div.className='flrow'; div.dataset.id='n'+uid();
    div.innerHTML=`<input class="fn" value="새 층"/><input class="fw" type="number" value="1400"/><span>×</span><input class="fh" type="number" value="800"/><button class="rm">✕</button>`; $('#flrlist').appendChild(div); bindRm(); };
  $('#fl_dup').onclick=()=>{ closeModal(); dupFloor(); };
  $('#m_cancel').onclick=closeModal;
  $('#m_ok').onclick=()=>{ const nf=$$('#flrlist .flrow',$('#modal')).map(r=>{ const old=STATE.floors.find(f=>f.id===r.dataset.id)||{}; return {id:r.dataset.id,name:r.querySelector('.fn').value.trim()||'층',w:+r.querySelector('.fw').value||1400,h:+r.querySelector('.fh').value||800, ...(old.mX?{mX:old.mX}:{}), ...(old.mY?{mY:old.mY}:{})}; });
    const ids=new Set(nf.map(f=>f.id)); STATE.items=STATE.items.filter(i=>ids.has(i.floorId)); STATE.floors=nf; if(fi>=nf.length)fi=0;
    closeModal(); markDirty(); pushHist(); tabs(); render(); fit(); };
}
/* 미배치 임직원 도크 → 드래그 배치 */
let placing=null, ghost=null;
$('#mgrUnseat').onclick=()=>{ const d=$('#udock'); d.hidden=!d.hidden; if(!d.hidden)renderDock(); };
function renderDock(){ const seated=new Set(STATE.items.filter(i=>i.type==='desk'&&i.name).map(i=>i.name));
  const un=STATE.employees.filter(e=>!seated.has(e.name));
  $('#udock').innerHTML=`<div class="udh">미배치 <b>${un.length}</b>명 <button class="udx" id="udClose">✕</button></div>
    <div class="udlist">${un.map(e=>`<div class="uitem" data-id="${e.id}"><span class="un">${esc(e.name)}</span><span class="ud">${esc(e.dept||'')}${e.rank?' · '+esc(e.rank):''}</span></div>`).join('')||'<div style="padding:12px;color:var(--faint);font-size:12px">모두 배치됨</div>'}</div>
    <div class="udhint">항목을 도면으로 끌어다 놓으면 배치됩니다</div>`;
  $('#udClose').onclick=()=>$('#udock').hidden=true;
  $$('#udock .uitem').forEach(el=>el.addEventListener('pointerdown',ev=>{ ev.preventDefault(); const emp=STATE.employees.find(x=>x.id===el.dataset.id); if(emp)startPlace(emp,ev); })); }
function startPlace(emp,e){ placing=emp; ghost=document.createElement('div'); ghost.className='ghost'; ghost.textContent=emp.name; document.body.appendChild(ghost); moveGhost(e);
  document.addEventListener('pointermove',moveGhost); document.addEventListener('pointerup',endPlace); }
function moveGhost(e){ if(ghost){ ghost.style.left=e.clientX+'px'; ghost.style.top=e.clientY+'px'; } }
function endPlace(e){ document.removeEventListener('pointermove',moveGhost); document.removeEventListener('pointerup',endPlace);
  if(ghost){ghost.remove(); ghost=null;} const emp=placing; placing=null; if(!emp)return;
  const r=wrap.getBoundingClientRect();
  if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){
    const x=snap((e.clientX-r.left-view.tx)/view.s), y=snap((e.clientY-r.top-view.ty)/view.s), dep=DBYNAME[emp.dept];
    STATE.items.push({id:uid(),floorId:curId(),type:'desk',x,y,w:80,h:68,name:emp.name,deptId:dep?dep.id:null,title:emp.rank||'',seatNo:'',occupied:true,z:2});
    markDirty(); pushHist(); render(); renderDock(); toast(emp.name+' 배치됨'); } }
/* 인쇄 / PNG */
function renderExportCanvas(){ const f=curFloor(); if(!f)return null; const S=2, cv=document.createElement('canvas'); cv.width=f.w*S; cv.height=f.h*S;
  const g=cv.getContext('2d'); g.scale(S,S); g.fillStyle='#ffffff'; g.fillRect(0,0,f.w,f.h);
  const rr=(x,y,w,h,r)=>{ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); };
  const its=STATE.items.filter(i=>i.floorId===f.id);
  its.filter(i=>i.type==='shape').forEach(i=>{ g.fillStyle='rgba(200,204,212,.6)'; g.fillRect(i.x,i.y,i.w,i.h); });
  its.filter(i=>i.type==='line').forEach(i=>{ g.fillStyle=(i.color&&i.color[0]==='#')?i.color:'#aab0bd'; g.fillRect(i.x,i.y,i.w,i.h); });
  g.textAlign='center'; g.textBaseline='middle';
  its.filter(i=>i.type==='facility').forEach(i=>{ g.fillStyle='#eef0f4'; g.strokeStyle='#d7dae2'; g.lineWidth=1; rr(i.x,i.y,i.w,i.h,10); g.fill(); g.stroke();
    if(i.label){ g.fillStyle='#3b3f4a'; g.font=`700 ${clamp(Math.round(Math.min(i.w,i.h)*0.16),11,20)}px "Malgun Gothic",sans-serif`; g.fillText(i.label.replace(/\n/g,' '),i.x+i.w/2,i.y+i.h/2); } });
  its.filter(i=>i.type==='label').forEach(i=>{ g.fillStyle='#3b3f4a'; g.font=`800 ${clamp(i.fontSize||14,12,18)}px "Malgun Gothic",sans-serif`; g.fillText((i.text||'').replace(/\n/g,' '),i.x+i.w/2,i.y+i.h/2); });
  its.filter(i=>i.type==='desk').forEach(i=>{ const dep=DBYID[i.deptId], c=dep?dep.color:'#9aa1b0', vac=!i.name;
    g.save(); if(vac){ g.setLineDash([4,3]); g.strokeStyle='#c3c8d4'; g.fillStyle='rgba(20,24,31,.03)'; } else { g.strokeStyle='#e6e8ee'; g.fillStyle='#ffffff'; }
    g.lineWidth=1; rr(i.x,i.y,i.w,i.h,9); g.fill(); g.stroke(); g.setLineDash([]);
    if(!vac){ g.fillStyle=c; rr(i.x,i.y,4,i.h,2); g.fill(); }
    g.fillStyle=vac?'#a4a9b4':'#16181f'; g.font=`${vac?600:700} ${vac?11:13}px "Malgun Gothic",sans-serif`; g.fillText(vac?'빈자리':i.name,i.x+i.w/2,i.y+i.h/2); g.restore(); });
  return cv; }
function exportPNG(){ const cv=renderExportCanvas(); if(!cv)return; cv.toBlob(b=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`자리배치도_${curFloor().name}.png`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }); }
function printMap(){ const cv=renderExportCanvas(); if(!cv)return; const url=cv.toDataURL('image/png');
  const w=window.open('','_blank'); if(!w)return alert('팝업이 차단되었습니다. 허용 후 다시 시도하세요.');
  w.document.write(`<html><head><title>자리배치도 ${esc(curFloor().name)}</title><style>@page{size:landscape;margin:10mm}body{margin:0}img{width:100%}</style></head><body><img src="${url}" onload="setTimeout(function(){window.print();},150)"/></body></html>`); w.document.close(); }
$('#pngBtn').onclick=exportPNG; $('#printBtn').onclick=printMap;

/* 치수선: 선 긋고 놓으면 길이(m) 입력→저장 · 📏로 전체 보이기/숨기기 */
function segStraight(a,b){ return Math.abs(b.x-a.x)>=Math.abs(b.y-a.y) ? {x:b.x,y:a.y} : {x:a.x,y:b.y}; }
/* 저장된 치수선(수동값)으로 배율 보정 — 축별로 가장 긴 값선을 기준(외곽 25.55 / 14.9) */
function calibrateFloor(st,f){ if(!f)return; const ms=(st.items||[]).filter(i=>i.type==='meas'&&i.floorId===f.id&&i.val>0&&!i.auto);
  let bh=null,bv=null; ms.forEach(m=>{ if((m.orient||'h')==='h'){ if(m.w>0&&(!bh||m.w>bh.w))bh=m; } else { if(m.h>0&&(!bv||m.h>bv.h))bv=m; } });
  if(bh)f.mX=bh.val/bh.w; if(bv)f.mY=bv.val/bv.h; }
function calibrateAll(st){ st=st||STATE; (st.floors||[]).forEach(f=>calibrateFloor(st,f)); }
function fmtM(m){ return (Math.round(m*10)/10).toFixed(1)+' m'; }
function autoLen(a,b){ const f=curFloor(); const dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y); const hz=dx>=dy; const len=hz?dx:dy; const sc=hz?f.mX:f.mY; return sc?fmtM(len*sc):Math.round(len)+' px'; }
function drawMeas(preview){ if(!mlayer)return; if(!measMode){ mlayer.innerHTML=''; return; }
  const inv=1/view.s, f=curFloor(); if(!f){ mlayer.innerHTML=''; return; }
  const seg=(a,b,id,prev,val)=>{ const mx=(a.x+b.x)/2,my=(a.y+b.y)/2; const text=(val!=null)?(val+' m'):autoLen(a,b); const manual=val!=null;
    return `<g ${id?`data-mi="${id}"`:''}>`+
      (id?`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="${18*inv}" style="pointer-events:stroke;cursor:move"/>`:'')+
      `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--accent)" stroke-width="${2*inv}" ${prev?`stroke-dasharray="${6*inv} ${4*inv}" opacity="0.7"`:''}/>`+
      `<circle cx="${a.x}" cy="${a.y}" r="${4*inv}" fill="#fff" stroke="var(--accent)" stroke-width="${2*inv}"/><circle cx="${b.x}" cy="${b.y}" r="${4*inv}" fill="#fff" stroke="var(--accent)" stroke-width="${2*inv}"/>`+
      `<text x="${mx}" y="${my}" dy="${-7*inv}" text-anchor="middle" font-size="${13*inv}" font-weight="800" fill="${manual?'#111827':'var(--accent)'}" stroke="#fff" stroke-width="${3.5*inv}" paint-order="stroke" style="stroke-linejoin:round">${text}</text></g>`; };
  let s=''; STATE.items.filter(i=>i.type==='meas'&&i.floorId===f.id).forEach(mi=>{ const h=(mi.orient||'h')==='h'; const a={x:mi.x,y:mi.y}, b=h?{x:mi.x+mi.w,y:mi.y}:{x:mi.x,y:mi.y+mi.h}; s+=seg(a,b,mi.id,false,mi.val); });
  if(preview)s+=seg(preview.a,preview.b,null,true,null); mlayer.innerHTML=s; }
function addMeas(a,b){ const dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y); const hz=dx>=dy; const len=hz?dx:dy; if(len<6)return null;
  const it={id:uid(),floorId:curId(),type:'meas',orient:hz?'h':'v'};
  if(hz){ it.x=Math.round(Math.min(a.x,b.x)); it.y=Math.round(a.y); it.w=Math.round(dx); it.h=0; }
  else { it.x=Math.round(a.x); it.y=Math.round(Math.min(a.y,b.y)); it.w=0; it.h=Math.round(dy); }
  it.auto=true; STATE.items.push(it); markDirty(); pushHist(); drawMeas(); return it; }
function editVal(id){ const it=STATE.items.find(x=>x.id===id); if(!it)return; const f=curFloor(); const hz=(it.orient||'h')==='h'; const len=hz?it.w:it.h;
  const auto=(hz?f.mX:f.mY)?(Math.round(len*(hz?f.mX:f.mY)*10)/10).toFixed(1):''; const cur=it.val!=null?it.val:auto;
  const inp=prompt('이 선의 실제 길이(m) 입력  ·  비우면 자동(보정) 표시\n※ 값을 넣으면 이 층 배율의 기준이 됩니다', cur); if(inp==null)return; const t=String(inp).trim();
  if(t===''){ delete it.val; it.auto=true; } else { const m=parseFloat(t); if(!(m>0))return alert('숫자로 입력하세요'); it.val=m; delete it.auto; }
  calibrateFloor(STATE,f); markDirty(); pushHist(); drawMeas(); }
function clearMeasure(){ if(mlayer)mlayer.innerHTML=''; }
$('#measBtn').onclick=()=>{ measMode=!measMode; $('#measBtn').classList.toggle('on',measMode); wrap.classList.toggle('measuring',measMode); drawMeas();
  if(measMode)toast('드래그=길이 자동표시(0.1m) · 선 클릭=길이 직접입력(배율 기준) · 끝점=늘리기 · 우클릭=삭제'); };
if(mlayer){ mlayer.addEventListener('contextmenu',e=>{ const g=e.target.closest('[data-mi]'); if(g){ e.preventDefault(); STATE.items=STATE.items.filter(x=>x.id!==g.dataset.mi); markDirty(); pushHist(); drawMeas(); } }); }

async function save(){ try{ STATE.updatedAt=Date.now();
    const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','x-edit-pass':adminPw},body:JSON.stringify(STATE)});
    if(r.status===401){ alert('편집 권한이 없어 저장할 수 없습니다. (비밀번호 확인)'); return; }
    if(!r.ok)throw new Error('HTTP '+r.status); dirty=false; $('#dirty').hidden=true; toast('저장되었습니다');
  }catch(e){ alert('저장 실패: '+e.message); } }
$('#saveBtn').onclick=save;
function toast(m){ const t=document.createElement('div'); t.textContent=m; t.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ink);color:var(--app);padding:11px 20px;border-radius:999px;z-index:90;font-weight:700;font-size:13.5px;box-shadow:0 12px 30px -12px rgba(0,0,0,.4)'; document.body.appendChild(t); setTimeout(()=>t.remove(),1700); }

window.addEventListener('beforeunload',e=>{ if(dirty){e.preventDefault();e.returnValue='';} });
addEventListener('resize',applyView);

/* ── 시작 ── */
(async function init(){
  STATE=await loadState(); refreshMaps();
  fi=0; tabs(); render(); fit(); pushHist();
})();
