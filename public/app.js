/* ════════════════════════════════════════════════════════════════
   자리배치도 (Seating Chart) — 독립 정적 웹앱
   - 보기 모드(기본): 임직원이 한눈에 보고 검색 — 잠금
   - 편집 모드: 관리자 비밀번호(0810) 입력 후 드래그/추가/수정
   - 영속화: localStorage(wylie_seating_v1)
     ※ 추후 DB 연동 시 load()/save() 두 함수만 fetch 로 교체하면 됨
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var STORE_KEY = 'wylie_seating_v5';
  var BACKUP_KEY = 'wylie_seating_backups';   // 자동 백업 스냅샷(롤링)
  var ADMIN_PW  = '0810';
  var GRID      = 10;     // 그리드 스냅(px)
  var DESK_W    = 116;    // 기본 좌석 크기
  var DESK_H    = 64;

  /* ── 기본 시드 데이터 (최초 1회) ──────────────────────────── */
  function seedData() {
    // data.js 가 있으면 참고 사이트에서 가져온 실제 데이터를 사용
    if (window.SEAT_SEED && window.SEAT_SEED.floors && window.SEAT_SEED.items) {
      return JSON.parse(JSON.stringify(window.SEAT_SEED));
    }
    return {
      floors: [
        { id: 'f1', name: '6F', w: 1200, h: 760 },
        { id: 'f2', name: '5F', w: 1200, h: 760 },
      ],
      depts: [
        { id: 'd1', name: '경영지원', color: '#3E6AE1' },
        { id: 'd2', name: '영업',     color: '#16A34A' },
        { id: 'd3', name: '개발',     color: '#D97706' },
        { id: 'd4', name: '디자인',   color: '#DB2777' },
      ],
      employees: [],
      items: [
        { id: 'l1', floorId: 'f1', type: 'label', x: 60, y: 36, w: 220, h: 30, text: '🏢 6층 사무공간', z: 1 },
        { id: 'z1', floorId: 'f1', type: 'zone', x: 60, y: 80, w: 540, h: 320, label: '경영지원팀', deptId: 'd1', secure: false, z: 0 },
        { id: 'z2', floorId: 'f1', type: 'zone', x: 630, y: 80, w: 510, h: 320, label: '영업팀', deptId: 'd2', secure: false, z: 0 },
        { id: 's1', floorId: 'f1', type: 'desk', x: 90,  y: 130, w: DESK_W, h: DESK_H, seatNo: 'A-01', name: '김와일', deptId: 'd1', title: '팀장', phone: '', email: '', note: '', occupied: true, z: 2 },
        { id: 's2', floorId: 'f1', type: 'desk', x: 220, y: 130, w: DESK_W, h: DESK_H, seatNo: 'A-02', name: '이지원', deptId: 'd1', title: '주임', phone: '', email: '', note: '', occupied: true, z: 2 },
        { id: 's3', floorId: 'f1', type: 'desk', x: 90,  y: 210, w: DESK_W, h: DESK_H, seatNo: 'A-03', name: '', deptId: 'd1', title: '', phone: '', email: '', note: '', occupied: false, z: 2 },
        { id: 's4', floorId: 'f1', type: 'desk', x: 660, y: 130, w: DESK_W, h: DESK_H, seatNo: 'B-01', name: '박영업', deptId: 'd2', title: '대리', phone: '', email: '', note: '', occupied: true, z: 2 },
        { id: 's5', floorId: 'f1', type: 'desk', x: 790, y: 130, w: DESK_W, h: DESK_H, seatNo: 'B-02', name: '최고객', deptId: 'd2', title: '사원', phone: '', email: '', note: '', occupied: true, z: 2 },
      ],
    };
  }

  /* ── 상태 ─────────────────────────────────────────────────── */
  var STATE = null;
  var curFloorId = null;
  var isLocked = true;
  var zoom = 1, panX = 0, panY = 0;
  var selection = [];
  var searchQ = '';
  var deptFilter = [];
  var emptyFilter = true;
  var spaceDown = false;
  var drag = null;
  var pinch = null;
  var clipboard = null;   // 복사/붙여넣기 버퍼 { floorId, items[] }

  /* DOM refs */
  var vp, canvas, floorsEl, legendEl, emptyEl, lockEl, editToolsEl, marqueeEl;
  var searchInput, searchWrap, zoomVal, ctxEl, popEl;
  var mBackdrop, mTitle, mBody, mFt;

  /* ── 헬퍼 ─────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) { return (p || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  // 좌석 안 부서명 표시: 긴 이름은 지정한 위치에서 줄바꿈 (표시용, 데이터 불변)
  var DEPT_BREAKS = {
    '퍼포먼스플랫폼본부': ['퍼포먼스', '플랫폼본부'],
    '퍼포먼스플랫폼 본부': ['퍼포먼스', '플랫폼본부'],
    '마케팅캠페인본부': ['마케팅', '캠페인본부'],
  };
  function deptDisplay(name) {
    var b = DEPT_BREAKS[name];
    if (b) return b.map(esc).join(String.fromCharCode(0x200B)); // 제로폭 공백 → 그 지점에서만 줄바꿈
    return esc(name);
  }
  function snap(n) { return Math.round(n / GRID) * GRID; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var toastTimer = null;
  function toast(msg, type) {
    var el = $('ui-toast'); if (!el) return;
    el.textContent = msg; el.className = '';
    if (type === 'ok' || type === 'err') el.classList.add(type);
    void el.offsetWidth; el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function deptById(id) { return STATE.depts.find(function (d) { return d.id === id; }); }
  function deptByName(name) { return STATE.depts.find(function (d) { return d.name === name; }); }
  function empByName(name) { return (STATE.employees || []).find(function (e) { return e.name === name; }); }
  function empsByName(name) { return (STATE.employees || []).filter(function (e) { return e.name === name; }); }
  function floorById(id) { return STATE.floors.find(function (f) { return f.id === id; }); }
  function curFloor() { return floorById(curFloorId) || STATE.floors[0]; }
  function curItems() { return STATE.items.filter(function (it) { return it.floorId === curFloorId; }); }
  function itemById(id) { return STATE.items.find(function (it) { return it.id === id; }); }

  function hexToBg(hex, a) {
    if (!hex) return 'rgba(0,0,0,0.04)';
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 0.12 : a) + ')';
  }

  /* ── 실행 취소(Undo) / 다시 실행(Redo) ────────────────────── */
  var undoStack = [], redoStack = [];
  function snapshot() { return JSON.stringify(STATE); }
  function pushSnapshot(json) {
    undoStack.push(json);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  // 변경 직전에 호출 → 현재 상태를 이력에 저장
  function pushHistory() { pushSnapshot(snapshot()); }
  function applyState(json) {
    STATE = JSON.parse(json);
    if (!floorById(curFloorId)) curFloorId = STATE.floors[0].id;
    selection = [];
    save(); render();
  }
  function undo() {
    if (!undoStack.length) { toast('되돌릴 항목이 없습니다'); return; }
    redoStack.push(snapshot());
    applyState(undoStack.pop());
    toast('실행 취소');
  }
  function redoAction() {
    if (!redoStack.length) { toast('다시 실행할 항목이 없습니다'); return; }
    undoStack.push(snapshot());
    applyState(redoStack.pop());
    toast('다시 실행');
  }

  /* ── 영속화 (localStorage / 공유 서버 자동 감지) ──────────
     - server.js 로 열면 http(s) → /api/state 로 실시간 공유 저장
     - index.html 더블클릭(file://) → localStorage (개인 저장)
  */
  var MODE = 'local';        // 'local' | 'server'
  var serverStamp = 0;       // 마지막으로 반영/저장한 서버 updatedAt
  var saveTimer = null;

  function loadLocal() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) { var j = JSON.parse(raw); if (j && j.floors && j.items) return j; }
      // 이전 버전 키에 남아있는 작업물이 있으면 최신 키로 자동 이관 (초기화 방지)
      var OLD = ['wylie_seating_v4', 'wylie_seating_v3', 'wylie_seating_v2', 'wylie_seating_v1'];
      for (var i = 0; i < OLD.length; i++) {
        var r = localStorage.getItem(OLD[i]);
        if (r) {
          var o = JSON.parse(r);
          if (o && o.floors && o.items) {
            if (!o.employees) o.employees = (window.SEAT_SEED && window.SEAT_SEED.employees) || [];
            localStorage.setItem(STORE_KEY, JSON.stringify(o));
            return o;
          }
        }
      }
    } catch (e) {}
    return seedData();
  }
  // 서버 사용 가능하면 서버 상태를, 아니면 로컬을 STATE 로 세팅
  function initState() {
    return fetch('api/state', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw 0;
      return r.json();
    }).then(function (j) {
      MODE = 'server';
      if (j && j.floors && j.items) { STATE = j; serverStamp = j.updatedAt || 0; }
      else { STATE = seedData(); save(); }   // 서버에 데이터 없으면 시드로 초기화
    }).catch(function () {
      MODE = 'local'; STATE = loadLocal();
    });
  }
  function save() {
    STATE.updatedAt = Date.now();
    autoBackup();
    markSaved();
    if (MODE === 'server') {
      serverStamp = STATE.updatedAt;
      if (saveTimer) clearTimeout(saveTimer);
      var body = JSON.stringify(STATE);
      saveTimer = setTimeout(function () {
        fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: body })
          .catch(function () { toast('서버 저장 실패', 'err'); });
      }, 250);
      return;
    }
    try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); }
    catch (e) { toast('저장 실패(브라우저 저장공간)', 'err'); }
  }

  /* ── 자동 백업 (저장 시 롤링 스냅샷) ──────────────────────────
     - 저장할 때마다 최근 상태를 타임스탬프와 함께 보관(최대 12개)
     - 너무 잦은 스냅샷 방지: 직전 백업 후 90초 이내면 마지막 항목을 갱신만
     - '💾 데이터 → 자동 백업에서 복구' 로 언제든 되살리기 가능 → 데이터 유실 방지
  */
  var lastBackupAt = 0;
  function readBackups() {
    try { var a = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function writeBackups(arr) {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(arr)); }
    catch (e) {
      // 용량 초과 시 오래된 것부터 버리며 재시도
      while (arr.length > 3) { arr.shift(); try { localStorage.setItem(BACKUP_KEY, JSON.stringify(arr)); return; } catch (e2) {} }
    }
  }
  function autoBackup() {
    try {
      var now = Date.now();
      var arr = readBackups();
      var snap = { ts: now, data: JSON.stringify(STATE) };
      // 90초 이내 연속 저장은 마지막 스냅샷을 덮어씀(복원 지점 과다 방지)
      if (arr.length && (now - lastBackupAt) < 90000) arr[arr.length - 1] = snap;
      else arr.push(snap);
      lastBackupAt = now;
      while (arr.length > 12) arr.shift();
      writeBackups(arr);
    } catch (e) {}
  }

  /* ── 저장 상태 표시 ("저장됨 ✓ HH:MM") ───────────────────── */
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function fmtDate(t) { var d = new Date(t); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hhmm(t); }
  function markSaved() {
    var el = $('seat-saved'); if (!el) return;
    el.hidden = false;
    el.textContent = '저장됨 ✓ ' + hhmm(STATE.updatedAt);
    el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
  }
  // 서버 모드: 보기 상태일 때 주기적으로 최신본 반영(다른 사람 편집 동기화)
  function startPolling() {
    setInterval(function () {
      if (MODE !== 'server' || !isLocked || drag || !mBackdrop.hidden) return;
      fetch('api/state', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.updatedAt && j.updatedAt > serverStamp) {
          serverStamp = j.updatedAt; STATE = j;
          if (!floorById(curFloorId)) curFloorId = STATE.floors[0].id;
          render();
        }
      }).catch(function () {});
    }, 7000);
  }

  /* ── 뷰 변환 ──────────────────────────────────────────────── */
  function applyTransform() {
    canvas.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    zoomVal.textContent = Math.round(zoom * 100) + '%';
  }
  function vpToCanvas(clientX, clientY) {
    var r = vp.getBoundingClientRect();
    return { x: (clientX - r.left - panX) / zoom, y: (clientY - r.top - panY) / zoom };
  }
  function setZoom(nz, cx, cy) {
    nz = Math.max(0.3, Math.min(2.5, nz));
    var r = vp.getBoundingClientRect();
    if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
    var bx = (cx - panX) / zoom, by = (cy - panY) / zoom;
    zoom = nz; panX = cx - bx * zoom; panY = cy - by * zoom;
    applyTransform();
  }
  function fitToScreen() {
    var f = curFloor(); if (!f) return;
    var r = vp.getBoundingClientRect();
    var pad = 48;
    var z = Math.min((r.width - pad) / f.w, (r.height - pad) / f.h);
    zoom = Math.max(0.3, Math.min(1.6, z));
    panX = (r.width - f.w * zoom) / 2;
    panY = (r.height - f.h * zoom) / 2;
    applyTransform();
  }

  /* ── 렌더 ─────────────────────────────────────────────────── */
  function renderFloors() {
    floorsEl.innerHTML = '';
    STATE.floors.forEach(function (f) {
      var cnt = STATE.items.filter(function (it) { return it.floorId === f.id && it.type === 'desk'; }).length;
      var b = document.createElement('button');
      b.className = 'seat-floor-tab' + (f.id === curFloorId ? ' seat-floor-tab--active' : '');
      b.innerHTML = esc(f.name) + ' <span class="seat-floor-tab__cnt">' + cnt + '</span>';
      b.dataset.fid = f.id;
      b.addEventListener('click', function () { curFloorId = f.id; selection = []; render(); fitToScreen(); });
      // 편집 모드: 드래그로 층 순서 변경
      if (!isLocked) {
        b.draggable = true;
        b.title = '드래그하면 층 순서를 바꿀 수 있어요';
        b.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', 'floor:' + f.id); e.dataTransfer.effectAllowed = 'move'; b.classList.add('dragging'); });
        b.addEventListener('dragend', function () { b.classList.remove('dragging'); });
        b.addEventListener('dragover', function (e) { e.preventDefault(); b.classList.add('drag-over'); });
        b.addEventListener('dragleave', function () { b.classList.remove('drag-over'); });
        b.addEventListener('drop', function (e) {
          e.preventDefault(); b.classList.remove('drag-over');
          var d = e.dataTransfer.getData('text/plain') || '';
          if (d.indexOf('floor:') === 0) reorderFloor(d.slice(6), f.id);
        });
      }
      floorsEl.appendChild(b);
    });
  }
  function reorderFloor(srcId, tgtId) {
    if (srcId === tgtId) return;
    var from = STATE.floors.findIndex(function (f) { return f.id === srcId; });
    var to = STATE.floors.findIndex(function (f) { return f.id === tgtId; });
    if (from < 0 || to < 0) return;
    pushHistory();
    var moved = STATE.floors.splice(from, 1)[0];
    STATE.floors.splice(to, 0, moved);
    save(); render();
    toast('층 순서를 변경했습니다', 'ok');
  }

  function matchSearch(it) {
    if (!searchQ) return true;
    if (it.type !== 'desk') return false;
    var dept = deptById(it.deptId);
    var hay = [it.name, it.title, it.seatNo, dept ? dept.name : ''].join(' ').toLowerCase();
    return hay.indexOf(searchQ) !== -1;
  }
  function passFilter(it) {
    if (it.type !== 'desk') return true;
    if (!it.occupied && !emptyFilter) return false;
    if (deptFilter.length && deptFilter.indexOf(it.deptId) === -1) return false;
    return true;
  }

  function buildDesk(it) {
    var dept = deptById(it.deptId);
    var el = document.createElement('div');
    el.className = 'seat-item seat-desk' + (it.occupied ? '' : ' seat-desk--empty');
    if (dept) { el.style.setProperty('--seat-color', dept.color); el.style.setProperty('--seat-color-bg', hexToBg(dept.color, 0.14)); }
    var html = '';
    if (it.seatNo) html += '<div class="seat-desk__seatno">' + esc(it.seatNo) + '</div>';
    html += '<div class="seat-desk__name">' + esc(it.occupied ? (it.name || '미지정') : '빈자리') + '</div>';
    if (it.occupied && dept) html += '<div class="seat-desk__dept">' + deptDisplay(dept.name) + '</div>';
    if (it.occupied && it.title) html += '<div class="seat-desk__title">' + esc(it.title) + '</div>';
    el.innerHTML = html;
    return el;
  }
  function buildLine(it) {
    var el = document.createElement('div');
    el.className = 'seat-item seat-line-item';
    var orient = it.orient || (it.w >= it.h ? 'h' : 'v');
    var t = Math.max(1, it.thickness || 3);
    var color = it.color || '#3B5BDB';
    var img;
    if (it.lineStyle === 'dashed') {
      var on = Math.max(6, t * 2.5), off = Math.max(4, t * 1.8);
      img = 'repeating-linear-gradient(' + (orient === 'h' ? 'to right' : 'to bottom') +
        ',' + color + ' 0 ' + on + 'px, transparent ' + on + 'px ' + (on + off) + 'px)';
    } else if (it.lineStyle === 'dotted') {
      var d = Math.max(2, t);
      img = 'repeating-linear-gradient(' + (orient === 'h' ? 'to right' : 'to bottom') +
        ',' + color + ' 0 ' + d + 'px, transparent ' + d + 'px ' + (d * 2.4) + 'px)';
    } else {
      img = 'linear-gradient(' + color + ',' + color + ')'; // 실선
    }
    el.style.backgroundImage = img;
    el.style.backgroundSize = orient === 'h' ? ('100% ' + t + 'px') : (t + 'px 100%');
    return el;
  }
  function buildZone(it) {
    var dept = deptById(it.deptId);
    var el = document.createElement('div');
    el.className = 'seat-item seat-zone-item' + (it.secure ? ' seat-zone--secure' : '');
    var col = dept ? dept.color : '#8E8E8E';
    el.style.setProperty('--seat-color', col);
    el.style.setProperty('--seat-color-bg', hexToBg(col, 0.06));
    el.innerHTML = '<div class="seat-zone-item__label">' + esc(it.label || '') + (it.secure ? ' 🔒' : '') + '</div>';
    return el;
  }
  function buildFacility(it) {
    var el = document.createElement('div');
    el.className = 'seat-item seat-facility-item';
    el.innerHTML = '<div class="seat-facility-item__icon">' + esc(it.icon || '🏷') + '</div>' +
      (it.label ? '<div class="seat-facility-item__label">' + esc(it.label) + '</div>' : '') +
      (it.ip ? '<div class="seat-facility-item__ip">IP : ' + esc(it.ip) + '</div>' : '');
    return el;
  }
  function buildShape(it) {
    var el = document.createElement('div');
    el.className = 'seat-item seat-shape-item' + (it.line ? ' seat-shape--line' : '');
    el.style.background = it.fill || '#999';
    if (!it.line && it.sw) el.style.border = it.sw + 'px solid ' + (it.stroke || '#777');
    return el;
  }
  function buildLabel(it) {
    var el = document.createElement('div');
    el.className = 'seat-item seat-label-item';
    el.textContent = it.text || '';
    if (it.color) el.style.color = it.color;
    if (it.fontSize) el.style.fontSize = it.fontSize + 'px';
    el.style.fontWeight = (it.bold === false) ? '400' : '700';
    return el;
  }

  function render() {
    var f = curFloor(); if (!f) return;
    canvas.style.width = f.w + 'px';
    canvas.style.height = f.h + 'px';

    Array.prototype.slice.call(canvas.querySelectorAll('.seat-item')).forEach(function (n) { n.remove(); });

    var items = curItems().slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    var hitCount = 0;
    items.forEach(function (it) {
      var el = it.type === 'desk' ? buildDesk(it)
        : it.type === 'zone' ? buildZone(it)
        : it.type === 'facility' ? buildFacility(it)
        : it.type === 'line' ? buildLine(it)
        : it.type === 'shape' ? buildShape(it)
        : buildLabel(it);
      el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
      el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
      el.style.zIndex = String((it.z || 0) + 10);
      el.dataset.id = it.id;

      // 좌석만 검색/필터로 흐려짐. 벽·라벨·시설은 맥락 유지(항상 표시)
      var shown = it.type === 'desk' ? (matchSearch(it) && passFilter(it)) : true;
      if (!shown) el.classList.add('is-dimmed');
      if (it.locked && !isLocked) el.classList.add('is-locked');   // 편집 모드에서만 자물쇠 표시
      if (searchQ && it.type === 'desk' && shown) { el.classList.add('is-hit'); hitCount++; }
      if (selection.indexOf(it.id) !== -1) {
        el.classList.add('is-selected');
        var rh = document.createElement('div'); rh.className = 'seat-resize'; el.appendChild(rh);
      }
      canvas.appendChild(el);
    });

    emptyEl.hidden = items.length !== 0;
    renderFloors();
    renderLegend(hitCount);
    if (sidePanelOpen) refreshUnseated();
  }

  // 해당 부서 재석이 가장 많은 층 id
  function deptBestFloor(deptId) {
    var best = null;
    STATE.floors.forEach(function (f) {
      var c = STATE.items.filter(function (it) { return it.type === 'desk' && it.floorId === f.id && it.deptId === deptId && it.occupied; }).length;
      if (c > 0 && (!best || c > best.c)) best = { id: f.id, c: c };
    });
    return best ? best.id : null;
  }
  function renderLegend(hitCount) {
    legendEl.innerHTML = '';
    var deskItems = STATE.items.filter(function (it) { return it.type === 'desk'; });
    STATE.depts.forEach(function (d) {
      var cnt = deskItems.filter(function (it) { return it.deptId === d.id && it.occupied; }).length;
      var active = deptFilter.indexOf(d.id) !== -1;
      var chip = document.createElement('button');
      chip.className = 'seat-legend__chip' + (active ? ' is-active' : '') + (deptFilter.length && !active ? ' is-off' : '');
      chip.innerHTML = '<span class="seat-legend__dot" style="background:' + esc(d.color) + '"></span>' + esc(d.name) + ' <span class="seat-legend__cnt">' + cnt + '</span>';
      chip.title = d.name + ' — 클릭하면 해당 부서가 있는 층으로 이동';
      chip.addEventListener('click', function () {
        // 같은 칩 다시 클릭 → 필터 해제
        if (deptFilter.length === 1 && deptFilter[0] === d.id) { deptFilter = []; render(); return; }
        var fl = deptBestFloor(d.id);
        if (!fl) { toast(d.name + ' 배치된 좌석이 없습니다'); return; }
        deptFilter = [d.id];
        if (fl !== curFloorId) curFloorId = fl;
        render();
        var hit = curItems().filter(function (it) { return it.type === 'desk' && it.deptId === d.id && it.occupied; })[0];
        if (hit) centerOn(hit);
      });
      legendEl.appendChild(chip);
    });
    var emptyCnt = curItems().filter(function (it) { return it.type === 'desk' && !it.occupied; }).length;
    var ec = document.createElement('button');
    ec.className = 'seat-legend__chip' + (emptyFilter ? '' : ' is-off');
    ec.innerHTML = '<span class="seat-legend__dot" style="background:#D0D1D2;border:1px dashed #8E8E8E"></span>빈자리 <span class="seat-legend__cnt">' + emptyCnt + '</span>';
    ec.addEventListener('click', function () { emptyFilter = !emptyFilter; render(); });
    legendEl.appendChild(ec);

    var occ = curItems().filter(function (it) { return it.type === 'desk' && it.occupied; }).length;
    var total = curItems().filter(function (it) { return it.type === 'desk'; }).length;
    var sum = document.createElement('div');
    sum.className = 'seat-legend__count-summary';
    sum.textContent = searchQ ? ('검색 결과 ' + hitCount + '명') : (curFloor().name + ' · 재석 ' + occ + ' / 총 ' + total + '석');
    legendEl.appendChild(sum);

    // 마지막 업데이트 표시 (신뢰도 · 최신 여부 확인용)
    if (STATE.updatedAt) {
      var upd = document.createElement('div');
      upd.className = 'seat-legend__updated';
      upd.innerHTML = '<span class="seat-legend__updated-ic">🕑</span> 최근 수정 ' + esc(fmtDate(STATE.updatedAt));
      upd.title = new Date(STATE.updatedAt).toLocaleString('ko-KR');
      legendEl.appendChild(upd);
    }
  }

  /* ── 보기 모드: 좌석 클릭 → 팝오버 ───────────────────────── */
  function openPopover(it, clientX, clientY) {
    var dept = deptById(it.deptId);
    popEl.style.setProperty('--seat-color', dept ? dept.color : '#3E6AE1');
    var rows = '';
    function row(k, v) { if (v) rows += '<div class="seat-pop__row"><span class="seat-pop__k">' + k + '</span><span class="seat-pop__v">' + esc(v) + '</span></div>'; }
    row('부서', dept ? dept.name : '');
    row('직급', it.title);
    row('좌석', it.seatNo);
    popEl.innerHTML =
      '<div class="seat-pop__hd"><div class="seat-pop__name">' + esc(it.occupied ? (it.name || '미지정') : '빈자리') + '</div>' +
      '<div class="seat-pop__sub">' + esc((dept ? dept.name : '') + (it.title ? ' · ' + it.title : '')) + '</div></div>' +
      (rows ? '<div class="seat-pop__body">' + rows + '</div>' : '');
    popEl.hidden = false;
    var pw = 244, ph = popEl.offsetHeight || 160;
    var x = clientX + 12, y = clientY + 12;
    if (x + pw > window.innerWidth - 8) x = clientX - pw - 12;
    if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
    popEl.style.left = Math.max(8, x) + 'px';
    popEl.style.top = Math.max(8, y) + 'px';
  }
  function closePopover() { popEl.hidden = true; }

  /* ── 모달 ─────────────────────────────────────────────────── */
  function openModal(title, bodyHTML, footerBtns, wide) {
    mTitle.textContent = title;
    mBody.innerHTML = bodyHTML;
    mFt.innerHTML = '';
    (footerBtns || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'ui-btn ' + (b.cls || 'ui-btn--ghost') + ' ui-btn--sm';
      if (b.spacerLeft) btn.classList.add('seat-ft-left');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      mFt.appendChild(btn);
    });
    $('seat-modal').classList.toggle('seat-modal--wide', !!wide);
    mBackdrop.hidden = false;
  }
  function closeModal() { mBackdrop.hidden = true; mBody.innerHTML = ''; }

  /* ── 편집: 잠금/해제 ──────────────────────────────────────── */
  function promptUnlock() {
    openModal('관리자 편집 모드',
      '<div class="seat-field"><label class="seat-field__label">비밀번호</label>' +
      '<input type="password" id="seat-pw" class="seat-inp" inputmode="numeric" placeholder="비밀번호 입력" autocomplete="off" />' +
      '<div class="seat-pw-err" id="seat-pw-err"></div>' +
      '<div class="seat-pw-hint">편집 모드에서는 좌석을 드래그·추가·수정할 수 있습니다.</div></div>',
      [{ label: '취소', onClick: closeModal }, { label: '편집 시작', cls: 'ui-btn', onClick: tryUnlock }]);
    var inp = $('seat-pw');
    setTimeout(function () { inp.focus(); }, 50);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') tryUnlock(); });
  }
  function tryUnlock() {
    var v = ($('seat-pw') || {}).value || '';
    if (v === ADMIN_PW) { closeModal(); enterEdit(); }
    else { $('seat-pw-err').textContent = '비밀번호가 올바르지 않습니다.'; $('seat-pw').value = ''; $('seat-pw').focus(); }
  }
  function enterEdit() {
    isLocked = false;
    $('seat-shell').classList.add('is-editing');
    vp.classList.add('is-editing');
    lockEl.className = 'seat-lock seat-lock--editing'; lockEl.innerHTML = '✎ 편집 중';
    $('seat-btn-edit').hidden = true; editToolsEl.hidden = false;
    closePopover(); toast('편집 모드로 전환되었습니다'); render();
  }
  function exitEdit() {
    isLocked = true; selection = [];
    $('seat-shell').classList.remove('is-editing');
    vp.classList.remove('is-editing');
    lockEl.className = 'seat-lock seat-lock--locked'; lockEl.innerHTML = '🔒 보기 모드';
    $('seat-btn-edit').hidden = false; editToolsEl.hidden = true;
    closeUnseated();
    save(); toast('저장되었습니다', 'ok'); render();
  }

  /* ── 편집: 아이템 추가 ───────────────────────────────────── */
  function centerCanvasPoint() {
    var r = vp.getBoundingClientRect();
    return vpToCanvas(r.left + r.width / 2, r.top + r.height / 2);
  }
  function addDesk(pt) {
    var p = pt || centerCanvasPoint();
    pushHistory();
    var it = { id: uid('s'), floorId: curFloorId, type: 'desk',
      x: snap(p.x - DESK_W / 2), y: snap(p.y - DESK_H / 2), w: DESK_W, h: DESK_H,
      seatNo: '', name: '', deptId: (STATE.depts[0] || {}).id || '', title: '', occupied: true, z: 5 };
    STATE.items.push(it); selection = [it.id]; save(); render(); editDeskModal(it.id);
  }
  function addZone(pt) {
    var p = pt || centerCanvasPoint();
    pushHistory();
    var it = { id: uid('z'), floorId: curFloorId, type: 'zone', x: snap(p.x - 130), y: snap(p.y - 90), w: 260, h: 180, label: '새 구역', deptId: '', secure: false, z: 0 };
    STATE.items.push(it); selection = [it.id]; save(); render(); editZoneModal(it.id);
  }
  function addLabel(pt) {
    var p = pt || centerCanvasPoint();
    pushHistory();
    var it = { id: uid('l'), floorId: curFloorId, type: 'label', x: snap(p.x - 60), y: snap(p.y - 15), w: 140, h: 30, text: '텍스트', fontSize: 14, bold: true, color: '#393C41', z: 1 };
    STATE.items.push(it); selection = [it.id]; save(); render(); editLabelModal(it.id);
  }
  var FACILITY_PRESETS = [
    { icon: '🚹', label: '화장실(남)' }, { icon: '🚺', label: '화장실(여)' }, { icon: '🚻', label: '화장실' },
    { icon: '🧥', label: '락커룸(남)' }, { icon: '👜', label: '락커룸(여)' }, { icon: '🛗', label: '엘리베이터' },
    { icon: '🪜', label: '계단' }, { icon: '🚪', label: '출입구' }, { icon: '🖨️', label: '복합기' },
    { icon: '🪑', label: '테이블' }, { icon: '👥', label: '회의실' }, { icon: '📞', label: '폰부스' },
    { icon: '☕', label: '휴게실' }, { icon: '🍽️', label: '탕비실' }, { icon: '📦', label: '창고' },
    { icon: '🔒', label: '서버실' },
  ];
  // 아이콘 자유 선택 팔레트 (이름은 직접 입력)
  var ICON_SET = [
    '🚹','🚺','🚻','🚽','🧥','👜','🛗','🪜','🚪','🚻',
    '🪑','🛋️','🍽️','☕','🧊','🚰','🫖','🧯','🧹','🧺',
    '🖨️','🖥️','💻','⌨️','🖱️','☎️','📞','📠','📺','📽️',
    '📦','🗄️','🗃️','🔒','🔑','📡','🛜','🔌','💡','🌡️',
    '👥','👤','🏢','🚭','🌿','🪴','♿','🅿️','🛒','🕐',
    '📌','🏷️','⚠️','🧴','🧻','🪞','🚬','🩹','📚','🗑️',
  ];
  function addFacility(pt) {
    var p = pt || centerCanvasPoint();
    pushHistory();
    var it = { id: uid('fc'), floorId: curFloorId, type: 'facility',
      x: snap(p.x - 50), y: snap(p.y - 36), w: 100, h: 72, icon: '👥', label: '회의실', z: 1 };
    STATE.items.push(it); selection = [it.id]; save(); render(); editFacilityModal(it.id);
  }
  function addLine(pt) {
    var p = pt || centerCanvasPoint();
    pushHistory();
    var it = { id: uid('ln'), floorId: curFloorId, type: 'line',
      x: snap(p.x - 100), y: snap(p.y - 8), w: 200, h: 16,
      orient: 'h', thickness: 3, color: '#3B5BDB', lineStyle: 'solid', z: 0 };
    STATE.items.push(it); selection = [it.id]; save(); render(); editLineModal(it.id);
  }
  function editLineModal(id) {
    var it = itemById(id); if (!it) return;
    var orient = it.orient || (it.w >= it.h ? 'h' : 'v');
    function styleOpt(v, t) { return '<option value="' + v + '"' + ((it.lineStyle || 'solid') === v ? ' selected' : '') + '>' + t + '</option>'; }
    openModal('선 / 벽',
      '<div class="seat-field__row">' +
        '<div class="seat-field"><label class="seat-field__label">방향</label><select id="ln-orient" class="seat-sel">' +
          '<option value="h"' + (orient === 'h' ? ' selected' : '') + '>가로 —</option>' +
          '<option value="v"' + (orient === 'v' ? ' selected' : '') + '>세로 |</option>' +
        '</select></div>' +
        '<div class="seat-field"><label class="seat-field__label">스타일</label><select id="ln-style" class="seat-sel">' +
          styleOpt('solid', '───  실선') + styleOpt('dashed', '- - -  점선') + styleOpt('dotted', '·····  점') +
        '</select></div>' +
      '</div>' +
      '<div class="seat-field__row">' +
        '<div class="seat-field"><label class="seat-field__label">굵기(px)</label><input id="ln-thick" class="seat-inp" type="number" min="1" max="30" value="' + (it.thickness || 3) + '"></div>' +
        '<div class="seat-field"><label class="seat-field__label">길이(px)</label><input id="ln-len" class="seat-inp" type="number" min="10" value="' + (orient === 'h' ? it.w : it.h) + '"></div>' +
        '<div class="seat-field" style="flex:0 0 70px"><label class="seat-field__label">색상</label><input id="ln-color" type="color" value="' + esc(it.color || '#3B5BDB') + '" style="width:100%;height:40px;padding:2px;border:1px solid var(--line-2);border-radius:var(--r-1)"></div>' +
      '</div>' +
      '<div class="seat-pw-hint">선은 드래그로 이동, 선택 후 우측 하단 핸들로 크기(길이) 조절도 됩니다.</div>',
      [
        { label: '삭제', cls: 'ui-btn--ghost', spacerLeft: true, onClick: function () { deleteItems([id]); closeModal(); } },
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          pushHistory();
          var o = $('ln-orient').value;
          var len = Math.max(10, parseInt($('ln-len').value, 10) || 200);
          var th = Math.max(1, Math.min(30, parseInt($('ln-thick').value, 10) || 3));
          it.orient = o; it.thickness = th; it.lineStyle = $('ln-style').value; it.color = $('ln-color').value;
          // 방향에 맞춰 바운딩 박스 재계산 (히트 영역은 최소 16px)
          if (o === 'h') { it.w = len; it.h = Math.max(16, th); }
          else { it.h = len; it.w = Math.max(16, th); }
          save(); render(); closeModal();
        } },
      ]);
  }
  function editFacilityModal(id) {
    var it = itemById(id); if (!it) return;
    var grid = FACILITY_PRESETS.map(function (p) {
      return '<button class="seat-icon-opt' + (p.icon === it.icon && p.label === it.label ? ' is-sel' : '') + '" data-icon="' + esc(p.icon) + '" data-label="' + esc(p.label) + '">' +
        p.icon + '<span>' + esc(p.label) + '</span></button>';
    }).join('');
    var pick = ICON_SET.map(function (ic) {
      return '<button data-ic="' + esc(ic) + '"' + (ic === it.icon ? ' class="is-sel"' : '') + '>' + ic + '</button>';
    }).join('');
    openModal('시설',
      '<div class="seat-field"><label class="seat-field__label">빠른 선택 (아이콘 + 이름)</label><div class="seat-icon-grid" id="fc-grid">' + grid + '</div></div>' +
      '<div class="seat-field"><label class="seat-field__label">아이콘 선택 (이름은 아래에서 직접 입력)</label><div class="seat-icon-pick" id="fc-pick">' + pick + '</div></div>' +
      '<div class="seat-field__row">' +
        '<div class="seat-field" style="flex:0 0 80px"><label class="seat-field__label">아이콘</label><input id="fc-icon" class="seat-inp" value="' + esc(it.icon) + '" style="text-align:center"></div>' +
        '<div class="seat-field"><label class="seat-field__label">이름</label><input id="fc-label" class="seat-inp" value="' + esc(it.label) + '" placeholder="예: 회의실"></div>' +
        '<div class="seat-field" style="flex:0 0 92px"><label class="seat-field__label">IP(숫자)</label><input id="fc-ip" class="seat-inp" value="' + esc(it.ip || '') + '" placeholder="001" inputmode="numeric" style="text-align:center"></div>' +
      '</div>' +
      '<div class="seat-pw-hint">IP는 숫자만 입력하면 <b>IP : 001</b> 형태로 표시됩니다. (복합기 등)</div>',
      [
        { label: '삭제', cls: 'ui-btn--ghost', spacerLeft: true, onClick: function () { deleteItems([id]); closeModal(); } },
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          pushHistory();
          it.icon = $('fc-icon').value.trim() || '🏷';
          it.label = $('fc-label').value.trim();
          var ipv = $('fc-ip').value.trim();
          if (/^\d+$/.test(ipv)) ipv = ipv.padStart(3, '0');
          it.ip = ipv;
          save(); render(); closeModal();
        } },
      ]);
    // 빠른 선택: 아이콘 + 이름 함께 채움
    $('fc-grid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-icon]'); if (!b) return;
      $('fc-icon').value = b.dataset.icon; $('fc-label').value = b.dataset.label;
      Array.prototype.slice.call($('fc-grid').children).forEach(function (c) { c.classList.remove('is-sel'); });
      b.classList.add('is-sel');
      selPick(b.dataset.icon);
    });
    // 아이콘 팔레트: 아이콘만 변경 (이름 유지)
    function selPick(ic) {
      Array.prototype.slice.call($('fc-pick').children).forEach(function (c) { c.classList.toggle('is-sel', c.dataset.ic === ic); });
    }
    $('fc-pick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-ic]'); if (!b) return;
      $('fc-icon').value = b.dataset.ic; selPick(b.dataset.ic);
    });
    setTimeout(function () { var l = $('fc-label'); if (l) l.focus(); }, 50);
  }

  /* ── 편집: 수정 모달 ─────────────────────────────────────── */
  function deptOptions(sel) {
    var o = '<option value="">(부서 없음)</option>';
    STATE.depts.forEach(function (d) { o += '<option value="' + d.id + '"' + (d.id === sel ? ' selected' : '') + '>' + esc(d.name) + '</option>'; });
    return o;
  }
  function editDeskModal(id) {
    var it = itemById(id); if (!it) return;
    var datalist = (STATE.employees || []).map(function (e) {
      return '<option value="' + esc(e.name) + '">' + esc(e.dept + (e.rank ? ' · ' + e.rank : '')) + '</option>';
    }).join('');
    openModal('좌석 정보',
      '<div class="seat-field"><label class="seat-check"><input type="checkbox" id="f-occ"' + (it.occupied ? ' checked' : '') + '> 사용 중(재석)</label></div>' +
      '<div class="seat-field"><label class="seat-field__label">이름 <span style="color:var(--text-4);font-weight:400">(임직원 명단에서 자동완성 · 부서/직급 자동입력)</span></label>' +
        '<input id="f-name" class="seat-inp" list="f-emp-list" value="' + esc(it.name) + '" placeholder="이름 입력 (예: 문병훈)" autocomplete="off">' +
        '<datalist id="f-emp-list">' + datalist + '</datalist>' +
        '<div class="seat-pw-hint" id="f-emp-hint"></div></div>' +
      '<div class="seat-field" id="f-dupe-wrap" hidden><label class="seat-field__label" style="color:var(--warn)">동명이인 선택</label>' +
        '<select id="f-dupe" class="seat-sel"></select></div>' +
      '<div class="seat-field__row">' +
        '<div class="seat-field"><label class="seat-field__label">부서</label><select id="f-dept" class="seat-sel">' + deptOptions(it.deptId) + '</select></div>' +
        '<div class="seat-field"><label class="seat-field__label">직급</label><input id="f-title" class="seat-inp" value="' + esc(it.title) + '" placeholder="GM"></div>' +
      '</div>' +
      '<div class="seat-field"><label class="seat-field__label">좌석번호</label><input id="f-seat" class="seat-inp" value="' + esc(it.seatNo) + '" placeholder="A-01 (선택)"></div>',
      [
        { label: '삭제', cls: 'ui-btn--ghost', spacerLeft: true, onClick: function () { deleteItems([id]); closeModal(); } },
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          pushHistory();
          it.occupied = $('f-occ').checked;
          it.seatNo = $('f-seat').value.trim();
          if (it.occupied) {
            it.name = $('f-name').value.trim();
            it.deptId = $('f-dept').value; it.title = $('f-title').value.trim();
          } else {
            // 공석: 이전 사용자 정보 모두 비움
            it.name = ''; it.deptId = ''; it.title = '';
          }
          save(); render(); closeModal();
        } },
      ]);
    // 이름 입력 → 임직원 자동매핑 (동명이인은 선택)
    var nameInp = $('f-name');
    function fillFrom(e) {
      var d = deptByName(e.dept);
      $('f-dept').value = d ? d.id : '';
      $('f-title').value = e.rank || '';
      if (!$('f-occ').checked) $('f-occ').checked = true;
      var hint = $('f-emp-hint');
      hint.textContent = '✓ ' + e.name + ' · ' + e.dept + (e.rank ? ' · ' + e.rank : '') + ' 적용됨';
      hint.style.color = 'var(--ok)';
    }
    function applyEmp() {
      var arr = empsByName(nameInp.value.trim());
      var wrap = $('f-dupe-wrap'), dupe = $('f-dupe'), hint = $('f-emp-hint');
      if (arr.length === 1) {
        wrap.hidden = true; fillFrom(arr[0]);
      } else if (arr.length > 1) {
        // 동명이인: 자동 적용하지 말고 선택하게
        dupe.innerHTML = '<option value="">— 어느 분인가요? (' + arr.length + '명) —</option>' +
          arr.map(function (e, i) { return '<option value="' + i + '">' + esc(e.dept + (e.rank ? ' · ' + e.rank : '')) + '</option>'; }).join('');
        wrap.hidden = false;
        hint.textContent = '⚠ 동명이인 ' + arr.length + '명입니다. 아래에서 선택하세요.';
        hint.style.color = 'var(--warn)';
      } else {
        wrap.hidden = true; hint.textContent = '';
      }
    }
    $('f-dupe').addEventListener('change', function () {
      var arr = empsByName(nameInp.value.trim());
      var i = parseInt(this.value, 10);
      if (!isNaN(i) && arr[i]) fillFrom(arr[i]);
    });
    // 사용 중 해제 → 이름·부서·직급 즉시 비움(공석)
    $('f-occ').addEventListener('change', function () {
      if (!this.checked) {
        nameInp.value = ''; $('f-dept').value = ''; $('f-title').value = '';
        $('f-dupe-wrap').hidden = true; $('f-emp-hint').textContent = '';
      }
    });
    nameInp.addEventListener('change', applyEmp);
    nameInp.addEventListener('input', function () { if (empsByName(nameInp.value.trim()).length) applyEmp(); });
    // 최초 진입 시 기존 이름이 동명이인이면 선택 UI 표시
    if (empsByName(it.name).length > 1) applyEmp();
    setTimeout(function () { nameInp.focus(); }, 50);
  }
  function editZoneModal(id) {
    var it = itemById(id); if (!it) return;
    openModal('구역 / 공간',
      '<div class="seat-field"><label class="seat-field__label">이름</label><input id="z-label" class="seat-inp" value="' + esc(it.label) + '" placeholder="대회의실 / 영업팀"></div>' +
      '<div class="seat-field"><label class="seat-field__label">색상(부서 연동)</label><select id="z-dept" class="seat-sel">' + deptOptions(it.deptId) + '</select></div>' +
      '<div class="seat-field"><label class="seat-check"><input type="checkbox" id="z-secure"' + (it.secure ? ' checked' : '') + '> 보안구역(실선 강조)</label></div>',
      [
        { label: '삭제', cls: 'ui-btn--ghost', spacerLeft: true, onClick: function () { deleteItems([id]); closeModal(); } },
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          pushHistory();
          it.label = $('z-label').value.trim(); it.deptId = $('z-dept').value; it.secure = $('z-secure').checked;
          save(); render(); closeModal();
        } },
      ]);
  }
  function editLabelModal(id) {
    var it = itemById(id); if (!it) return;
    var sizes = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40];
    var curSize = it.fontSize || 14;
    var sizeOpts = sizes.map(function (s) { return '<option value="' + s + '"' + (s === curSize ? ' selected' : '') + '>' + s + 'px</option>'; }).join('');
    var isBold = it.bold !== false;
    openModal('텍스트',
      '<div class="seat-field"><label class="seat-field__label">텍스트</label><input id="t-text" class="seat-inp" value="' + esc(it.text) + '"></div>' +
      '<div class="seat-field__row">' +
        '<div class="seat-field"><label class="seat-field__label">글씨 크기</label><select id="t-size" class="seat-sel">' + sizeOpts + '</select></div>' +
        '<div class="seat-field" style="flex:0 0 84px"><label class="seat-field__label">색상</label><input id="t-color" type="color" value="' + esc(it.color || '#393C41') + '" style="width:100%;height:40px;padding:2px;border:1px solid var(--line-2);border-radius:var(--r-1)"></div>' +
      '</div>' +
      '<div class="seat-field"><label class="seat-check"><input type="checkbox" id="t-bold"' + (isBold ? ' checked' : '') + '> 굵게(Bold)</label></div>',
      [
        { label: '삭제', cls: 'ui-btn--ghost', spacerLeft: true, onClick: function () { deleteItems([id]); closeModal(); } },
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          pushHistory();
          it.text = $('t-text').value;
          it.fontSize = parseInt($('t-size').value, 10) || 14;
          it.color = $('t-color').value;
          it.bold = $('t-bold').checked;
          save(); render(); closeModal();
        } },
      ]);
    setTimeout(function () { var n = $('t-text'); if (n) { n.focus(); n.select(); } }, 50);
  }
  function openEditFor(id) {
    var it = itemById(id); if (!it) return;
    if (it.type === 'desk') editDeskModal(id);
    else if (it.type === 'zone') editZoneModal(id);
    else if (it.type === 'facility') editFacilityModal(id);
    else if (it.type === 'line') editLineModal(id);
    else if (it.type === 'shape') return; /* 기둥 도형은 이동·삭제만 (우클릭) */
    else editLabelModal(id);
  }

  /* ── 편집: 복사 / 붙여넣기 (층 전체·선택 항목) ──────────────
     붙여넣을 때 좌석의 이름/직급은 비워 '공석'으로 만든다(인물 중복 방지) */
  function copySelection() {
    if (!selection.length) { toast('선택된 항목이 없습니다 (Ctrl+A 로 전체 선택)'); return; }
    var items = selection.map(function (id) { return itemById(id); }).filter(Boolean).map(function (it) { return clone(it); });
    clipboard = { floorId: curFloorId, items: items };
    toast(items.length + '개 복사됨 · 다른 층 이동 후 Ctrl+V');
  }
  function copyFloor() {
    var its = curItems().map(function (it) { return clone(it); });
    if (!its.length) { toast('이 층에 복사할 항목이 없습니다'); return; }
    clipboard = { floorId: curFloorId, items: its };
    toast(curFloor().name + ' 전체 ' + its.length + '개 복사됨 · 다른 층에서 붙여넣기');
  }
  function pasteClipboard() {
    if (!clipboard || !clipboard.items.length) { toast('붙여넣을 항목이 없습니다'); return; }
    pushHistory();
    var off = (clipboard.floorId === curFloorId) ? 20 : 0;   // 같은 층이면 겹치지 않게 살짝 이동
    var newIds = [];
    clipboard.items.forEach(function (src) {
      var c = clone(src);
      c.id = uid((c.type || 'x')[0]);
      c.floorId = curFloorId;
      c.x = snap((c.x || 0) + off); c.y = snap((c.y || 0) + off);
      if (c.type === 'desk') { c.name = ''; c.title = ''; c.occupied = false; }  // 공석 처리
      STATE.items.push(c); newIds.push(c.id);
    });
    selection = newIds;
    save(); render();
    toast(newIds.length + '개 붙여넣음 (좌석은 공석 처리)', 'ok');
  }

  /* ── 편집: 삭제/복제 ─────────────────────────────────────── */
  function deleteItems(ids) {
    // 잠긴 항목은 삭제에서 제외 (실수 방지)
    var lockedCnt = ids.filter(function (id) { var it = itemById(id); return it && it.locked; }).length;
    ids = ids.filter(function (id) { var it = itemById(id); return it && !it.locked; });
    if (!ids.length) { toast('잠긴 항목은 삭제할 수 없습니다 🔒'); return; }
    pushHistory();
    STATE.items = STATE.items.filter(function (it) { return ids.indexOf(it.id) === -1; });
    selection = selection.filter(function (id) { return ids.indexOf(id) === -1; });
    save(); render();
    toast(lockedCnt ? ('삭제됨 (잠긴 ' + lockedCnt + '개 제외)') : '삭제되었습니다');
  }
  function duplicateItem(id) {
    var it = itemById(id); if (!it) return;
    pushHistory();
    var copy = clone(it); copy.id = uid(it.type[0]);
    copy.x = snap(it.x + 20); copy.y = snap(it.y + 20);
    if (copy.type === 'desk') { copy.name = ''; copy.occupied = false; copy.seatNo = ''; }
    delete copy.locked;
    STATE.items.push(copy); selection = [copy.id]; save(); render();
  }

  /* ── 편집: 정렬 · 균등 배분 ──────────────────────────────────
     선택한 2개 이상 항목을 한 번에 줄 맞추거나 간격을 고르게 배분 */
  function selectedItems() { return selection.map(itemById).filter(Boolean); }
  function alignSel(how) {
    var items = selectedItems(); if (items.length < 2) { toast('2개 이상 선택하세요'); return; }
    pushHistory();
    var minX = Math.min.apply(null, items.map(function (i) { return i.x; }));
    var maxR = Math.max.apply(null, items.map(function (i) { return i.x + i.w; }));
    var minY = Math.min.apply(null, items.map(function (i) { return i.y; }));
    var maxB = Math.max.apply(null, items.map(function (i) { return i.y + i.h; }));
    var cx = (minX + maxR) / 2, cy = (minY + maxB) / 2;
    items.forEach(function (i) {
      if (i.locked) return;
      if (how === 'left') i.x = minX;
      else if (how === 'right') i.x = maxR - i.w;
      else if (how === 'hcenter') i.x = Math.round(cx - i.w / 2);
      else if (how === 'top') i.y = minY;
      else if (how === 'bottom') i.y = maxB - i.h;
      else if (how === 'vcenter') i.y = Math.round(cy - i.h / 2);
      i.x = snap(i.x); i.y = snap(i.y);
    });
    save(); render();
    toast('정렬했습니다');
  }
  function distributeSel(axis) {
    var items = selectedItems().filter(function (i) { return !i.locked; });
    if (items.length < 3) { toast('3개 이상 선택하세요'); return; }
    pushHistory();
    if (axis === 'h') {
      items.sort(function (a, b) { return a.x - b.x; });
      var step = (items[items.length - 1].x - items[0].x) / (items.length - 1), x0 = items[0].x;
      items.forEach(function (it, i) { it.x = snap(x0 + step * i); });
    } else {
      items.sort(function (a, b) { return a.y - b.y; });
      var step2 = (items[items.length - 1].y - items[0].y) / (items.length - 1), y0 = items[0].y;
      items.forEach(function (it, i) { it.y = snap(y0 + step2 * i); });
    }
    save(); render();
    toast('균등 배분했습니다');
  }

  /* ── 편집: 위치 고정(잠금) 토글 ────────────────────────────── */
  function toggleLock(ids) {
    var items = ids.map(itemById).filter(Boolean); if (!items.length) return;
    pushHistory();
    var anyUnlocked = items.some(function (i) { return !i.locked; });
    items.forEach(function (i) { i.locked = anyUnlocked; });
    save(); render();
    toast(anyUnlocked ? '위치를 고정했습니다 🔒' : '고정을 해제했습니다 🔓');
  }

  /* ── 편집: 좌석 여러 개 한 번에 만들기 ─────────────────────── */
  function bulkDeskModal(pt) {
    var p = pt || centerCanvasPoint();
    var deptOpts = STATE.depts.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');
    openModal('좌석 여러 개 만들기',
      '<div class="seat-bulk">' +
        '<label class="seat-field"><span class="seat-field__label">가로 개수</span><input class="seat-inp" id="bc-cols" type="number" min="1" max="30" value="5"></label>' +
        '<label class="seat-field"><span class="seat-field__label">세로 개수(줄)</span><input class="seat-inp" id="bc-rows" type="number" min="1" max="30" value="2"></label>' +
        '<label class="seat-field"><span class="seat-field__label">가로 간격(px)</span><input class="seat-inp" id="bc-gx" type="number" min="0" max="200" value="8"></label>' +
        '<label class="seat-field"><span class="seat-field__label">세로 간격(px)</span><input class="seat-inp" id="bc-gy" type="number" min="0" max="200" value="8"></label>' +
        '<label class="seat-field seat-bulk__full"><span class="seat-field__label">부서(선택)</span><select class="seat-inp" id="bc-dept"><option value="">— 없음 —</option>' + deptOpts + '</select></label>' +
      '</div>' +
      '<div class="seat-pw-hint">현재 보이는 위치부터 오른쪽·아래로 격자 배치됩니다. 모두 <b>빈자리(공석)</b>로 생성되며, 배치 후 이름을 넣으면 됩니다.</div>',
      [
        { label: '취소', onClick: closeModal },
        { label: '만들기', cls: 'ui-btn--primary', onClick: function () {
          var cols = Math.max(1, Math.min(30, parseInt($('bc-cols').value, 10) || 1));
          var rows = Math.max(1, Math.min(30, parseInt($('bc-rows').value, 10) || 1));
          var gx = Math.max(0, parseInt($('bc-gx').value, 10) || 0);
          var gy = Math.max(0, parseInt($('bc-gy').value, 10) || 0);
          var deptId = $('bc-dept').value || (STATE.depts[0] || {}).id || '';
          pushHistory();
          var x0 = snap(p.x), y0 = snap(p.y), news = [];
          for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
              var it = { id: uid('s'), floorId: curFloorId, type: 'desk',
                x: x0 + c * (DESK_W + gx), y: y0 + r * (DESK_H + gy), w: DESK_W, h: DESK_H,
                seatNo: '', name: '', deptId: deptId, title: '', occupied: false, z: 5 };
              STATE.items.push(it); news.push(it.id);
            }
          }
          selection = news; save(); render(); closeModal();
          toast(news.length + '개 좌석을 만들었습니다', 'ok');
        } },
      ]);
  }

  /* ── 편집: 부서 관리 ─────────────────────────────────────── */
  function deptManagerModal() {
    function rows() {
      return STATE.depts.map(function (d) {
        return '<div class="seat-manage-row" data-id="' + d.id + '">' +
          '<input type="color" value="' + esc(d.color) + '" data-k="color">' +
          '<input class="seat-inp" value="' + esc(d.name) + '" data-k="name" placeholder="부서명">' +
          '<button class="seat-manage-del" data-del title="삭제">🗑</button></div>';
      }).join('');
    }
    openModal('부서 관리',
      '<div class="seat-manage-list" id="dept-list">' + rows() + '</div>' +
      '<div style="margin-top:12px"><button class="ui-btn ui-btn--ghost ui-btn--sm" id="dept-add">＋ 부서 추가</button></div>',
      [
        { label: '취소', onClick: function () { closeModal(); render(); } },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          var list = [];
          Array.prototype.slice.call($('dept-list').children).forEach(function (row) {
            var name = row.querySelector('[data-k="name"]').value.trim();
            var color = row.querySelector('[data-k="color"]').value;
            if (name) list.push({ id: row.dataset.id, name: name, color: color });
          });
          if (!list.length) { toast('최소 1개 부서가 필요합니다', 'err'); return; }
          pushHistory();
          STATE.depts = list; save(); render(); closeModal(); toast('부서가 저장되었습니다', 'ok');
        } },
      ]);
    $('dept-add').addEventListener('click', function () {
      var row = document.createElement('div');
      row.className = 'seat-manage-row'; row.dataset.id = uid('d');
      row.innerHTML = '<input type="color" value="#3E6AE1" data-k="color">' +
        '<input class="seat-inp" value="" data-k="name" placeholder="부서명">' +
        '<button class="seat-manage-del" data-del title="삭제">🗑</button>';
      $('dept-list').appendChild(row);
      row.querySelector('[data-k="name"]').focus();
    });
    $('dept-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'); if (del) del.closest('.seat-manage-row').remove();
    });
  }

  /* ── 편집: 층 관리 ───────────────────────────────────────── */
  function floorManagerModal() {
    function rows() {
      return STATE.floors.map(function (f) {
        return '<div class="seat-manage-row" data-id="' + f.id + '">' +
          '<input class="seat-inp" value="' + esc(f.name) + '" data-k="name" placeholder="층 이름" style="flex:2">' +
          '<input class="seat-inp" type="number" value="' + f.w + '" data-k="w" title="가로(px)" style="flex:1">' +
          '<input class="seat-inp" type="number" value="' + f.h + '" data-k="h" title="세로(px)" style="flex:1">' +
          '<button class="seat-manage-del" data-del title="삭제">🗑</button></div>';
      }).join('');
    }
    openModal('층 관리',
      '<div class="seat-manage-list" id="floor-list">' + rows() + '</div>' +
      '<div style="margin-top:12px"><button class="ui-btn ui-btn--ghost ui-btn--sm" id="floor-add">＋ 층 추가</button></div>' +
      '<div class="seat-pw-hint" style="margin-top:10px">가로/세로는 배치 캔버스 크기(px)입니다. 층 삭제 시 해당 층의 좌석도 함께 삭제됩니다.</div>',
      [
        { label: '취소', onClick: closeModal },
        { label: '저장', cls: 'ui-btn', onClick: function () {
          var list = [];
          Array.prototype.slice.call($('floor-list').children).forEach(function (row) {
            var name = row.querySelector('[data-k="name"]').value.trim();
            var w = parseInt(row.querySelector('[data-k="w"]').value, 10) || 1200;
            var h = parseInt(row.querySelector('[data-k="h"]').value, 10) || 760;
            if (name) list.push({ id: row.dataset.id, name: name, w: w, h: h });
          });
          if (!list.length) { toast('최소 1개 층이 필요합니다', 'err'); return; }
          pushHistory();
          var keepIds = list.map(function (f) { return f.id; });
          STATE.items = STATE.items.filter(function (it) { return keepIds.indexOf(it.floorId) !== -1; });
          STATE.floors = list;
          if (keepIds.indexOf(curFloorId) === -1) curFloorId = list[0].id;
          save(); render(); fitToScreen(); closeModal(); toast('층이 저장되었습니다', 'ok');
        } },
      ]);
    $('floor-add').addEventListener('click', function () {
      var row = document.createElement('div');
      row.className = 'seat-manage-row'; row.dataset.id = uid('f');
      row.innerHTML = '<input class="seat-inp" value="" data-k="name" placeholder="층 이름" style="flex:2">' +
        '<input class="seat-inp" type="number" value="1200" data-k="w" style="flex:1">' +
        '<input class="seat-inp" type="number" value="760" data-k="h" style="flex:1">' +
        '<button class="seat-manage-del" data-del title="삭제">🗑</button>';
      $('floor-list').appendChild(row);
      row.querySelector('[data-k="name"]').focus();
    });
    $('floor-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'); if (del) del.closest('.seat-manage-row').remove();
    });
  }

  /* ── 데이터: 백업/복원/엑셀(CSV)/초기화 ─────────────────── */
  function downloadFile(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function stamp() { var d = new Date(); return '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()); }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function exportCSV() {
    var head = ['층', '좌석번호', '이름', '부서', '직급', '사용중'];
    var lines = [head.join(',')];
    STATE.items.filter(function (it) { return it.type === 'desk'; }).forEach(function (it) {
      var f = floorById(it.floorId), d = deptById(it.deptId);
      lines.push([f ? f.name : '', it.seatNo, it.name, d ? d.name : '', it.title, it.occupied ? 'Y' : 'N'].map(csvCell).join(','));
    });
    downloadFile('자리배치_좌석_' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    toast('CSV를 내보냈습니다', 'ok');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }
  var PALETTE = ['#3E6AE1', '#16A34A', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626', '#65A30D'];
  function ensureFloor(name) {
    var f = STATE.floors.find(function (x) { return x.name === name; });
    if (!f && name) { f = { id: uid('f'), name: name, w: 1200, h: 760 }; STATE.floors.push(f); }
    return f || curFloor();
  }
  function ensureDept(name) {
    if (!name) return '';
    var d = STATE.depts.find(function (x) { return x.name === name; });
    if (!d) { d = { id: uid('d'), name: name, color: PALETTE[STATE.depts.length % PALETTE.length] }; STATE.depts.push(d); }
    return d.id;
  }
  function importCSV(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) { toast('가져올 데이터가 없습니다', 'err'); return; }
    pushHistory();
    var added = 0;
    // 층별 자동 배치 좌표 추적
    var place = {};
    function nextPos(floorId) {
      if (!place[floorId]) {
        // 기존 좌석 다음 줄부터 배치
        var ex = STATE.items.filter(function (it) { return it.floorId === floorId && it.type === 'desk'; });
        var maxY = ex.reduce(function (m, it) { return Math.max(m, it.y + it.h); }, 40);
        place[floorId] = { x: 40, y: snap(maxY + 20), col: 0 };
      }
      var p = place[floorId];
      var pos = { x: p.x + p.col * (DESK_W + 14), y: p.y };
      p.col++;
      if (p.col >= 8) { p.col = 0; p.y += DESK_H + 14; }
      return pos;
    }
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var floorName = (r[0] || '').trim(), seatNo = (r[1] || '').trim(), name = (r[2] || '').trim();
      var deptName = (r[3] || '').trim(), title = (r[4] || '').trim();
      var occRaw = (r[5] || '').trim();
      var occ = /^(y|yes|o|true|1|사용|재석)/i.test(occRaw);
      if (!floorName && !seatNo && !name) continue;
      var f = ensureFloor(floorName || curFloor().name);
      var deptId = ensureDept(deptName);
      // 같은 층 + 좌석번호 있으면 upsert
      var existing = seatNo ? STATE.items.find(function (it) { return it.type === 'desk' && it.floorId === f.id && it.seatNo === seatNo; }) : null;
      if (existing) {
        existing.name = name; existing.deptId = deptId; existing.title = title;
        existing.occupied = occRaw !== '' ? occ : !!name;
      } else {
        var pos = nextPos(f.id);
        STATE.items.push({ id: uid('s'), floorId: f.id, type: 'desk', x: pos.x, y: pos.y, w: DESK_W, h: DESK_H,
          seatNo: seatNo, name: name, deptId: deptId, title: title,
          occupied: occRaw !== '' ? occ : !!name, z: 2 });
      }
      added++;
    }
    save();
    if (STATE.floors.indexOf(curFloor()) === -1) curFloorId = STATE.floors[0].id;
    render(); fitToScreen();
    toast(added + '개 좌석을 가져왔습니다', 'ok');
  }

  function dataModal() {
    openModal('데이터 관리',
      '<div class="seat-field"><label class="seat-field__label">백업 / 복원 (전체 JSON)</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="dm-export-json">📤 백업 내보내기(JSON)</button>' +
          '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="dm-import-json">📥 백업 복원(JSON)</button>' +
          '<button class="ui-btn ui-btn--sm" id="dm-autobackup">🕑 자동 백업에서 복구</button>' +
          '<button class="ui-btn ui-btn--sm" id="dm-recover">🧩 사라진 데이터 복구</button>' +
        '</div>' +
        '<div class="seat-pw-hint">저장할 때마다 최근 상태가 자동 보관됩니다(최대 12개). 실수하거나 데이터가 사라져도 <b>🕑 자동 백업에서 복구</b>로 되살릴 수 있습니다.</div></div>' +
      '<div class="seat-field"><label class="seat-field__label">엑셀 (CSV — 좌석 명단)</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="dm-export-csv">📊 CSV 내보내기</button>' +
          '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="dm-import-csv">📈 CSV 가져오기</button>' +
        '</div>' +
        '<div class="seat-pw-hint">열: 층, 좌석번호, 이름, 부서, 직급, 사용중(Y/N). 같은 층·좌석번호는 덮어쓰기됩니다.</div>' +
      '</div>' +
      '<div class="seat-field"><label class="seat-field__label" style="color:var(--err)">초기화</label>' +
        '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="dm-reset" style="color:var(--err);border-color:#f3c0c0">⟲ 기본값으로 초기화</button>' +
        '<div class="seat-pw-hint">모든 좌석·구역·부서·층이 예시 데이터로 되돌아갑니다.</div>' +
      '</div>' +
      '<input type="file" id="dm-file" accept=".json,.csv,text/csv,application/json" hidden>',
      [{ label: '닫기', onClick: closeModal }]);

    var fileMode = null;
    var fileInput = $('dm-file');
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          if (fileMode === 'json') {
            var j = JSON.parse(reader.result);
            if (!j.floors || !j.items) throw 0;
            pushHistory();
            if (!j.employees) j.employees = [];
            STATE = j; curFloorId = STATE.floors[0].id; save(); render(); fitToScreen();
            toast('백업을 복원했습니다', 'ok'); closeModal();
          } else { importCSV(reader.result); closeModal(); }
        } catch (e) { toast('파일을 읽을 수 없습니다', 'err'); }
      };
      reader.readAsText(file, 'utf-8');
      fileInput.value = '';
    });

    $('dm-recover').addEventListener('click', function () { closeModal(); recoverModal(); });
    $('dm-autobackup').addEventListener('click', function () { closeModal(); autoBackupModal(); });
    $('dm-export-json').addEventListener('click', function () { downloadFile('자리배치_백업_' + stamp() + '.json', JSON.stringify(STATE, null, 2), 'application/json'); toast('백업을 내보냈습니다', 'ok'); });
    $('dm-import-json').addEventListener('click', function () { fileMode = 'json'; fileInput.click(); });
    $('dm-export-csv').addEventListener('click', exportCSV);
    $('dm-import-csv').addEventListener('click', function () { fileMode = 'csv'; fileInput.click(); });
    $('dm-reset').addEventListener('click', function () {
      if (!confirm('모든 데이터를 기본값으로 초기화하시겠습니까?')) return;
      pushHistory();
      STATE = seedData(); curFloorId = STATE.floors[0].id; selection = []; save(); render(); fitToScreen();
      toast('초기화되었습니다', 'ok'); closeModal();
    });
  }

  /* ── 임직원 관리 (이름·부서·직급 마스터) ─────────────────── */
  function empRowHTML(e) {
    return '<div class="seat-manage-row" data-id="' + (e.id || '') + '">' +
      '<input class="seat-inp" data-k="name" value="' + esc(e.name || '') + '" placeholder="이름" style="flex:1.1">' +
      '<input class="seat-inp" data-k="dept" value="' + esc(e.dept || '') + '" placeholder="부서명" style="flex:1.4">' +
      '<input class="seat-inp" data-k="rank" value="' + esc(e.rank || '') + '" placeholder="직급" style="flex:0 0 84px">' +
      '<button class="seat-manage-del" data-del title="삭제">🗑</button></div>';
  }
  function empManagerModal() {
    var list = (STATE.employees || []).slice();
    openModal('임직원 관리',
      '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
        '<input id="emp-search" class="seat-inp" placeholder="이름·부서·직급 검색" style="flex:1;min-width:150px">' +
        '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="emp-add">＋ 추가</button>' +
        '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="emp-imp">📥 CSV</button>' +
        '<button class="ui-btn ui-btn--ghost ui-btn--sm" id="emp-exp">📤 CSV</button>' +
      '</div>' +
      '<div class="seat-manage-list" id="emp-list" style="max-height:52vh;overflow:auto">' +
        list.map(empRowHTML).join('') +
      '</div>' +
      '<input type="file" id="emp-file" accept=".csv,text/csv" hidden>' +
      '<div class="seat-pw-hint" id="emp-count">' + list.length + '명 · 저장 시 같은 이름의 좌석에 부서·직급이 자동 반영됩니다.</div>',
      [
        { label: '닫기', onClick: closeModal },
        { label: '저장 + 좌석 반영', cls: 'ui-btn', onClick: function () {
          pushHistory();
          var arr = [];
          Array.prototype.slice.call($('emp-list').children).forEach(function (row) {
            var name = row.querySelector('[data-k="name"]').value.trim();
            var dept = row.querySelector('[data-k="dept"]').value.trim();
            var rank = row.querySelector('[data-k="rank"]').value.trim();
            if (name) arr.push({ id: row.dataset.id || uid('e'), name: name, dept: dept, rank: rank });
          });
          STATE.employees = arr;
          // 좌석 연동: 이름이 같은 좌석에 부서/직급 반영
          var byName = {}; arr.forEach(function (e) { if (!byName[e.name]) byName[e.name] = e; });
          var synced = 0;
          STATE.items.forEach(function (it) {
            if (it.type === 'desk' && it.name && byName[it.name]) {
              var e = byName[it.name]; it.deptId = ensureDept(e.dept); it.title = e.rank || it.title; synced++;
            }
          });
          save(); render(); closeModal();
          toast('임직원 ' + arr.length + '명 저장 · 좌석 ' + synced + '석 반영', 'ok');
        } },
      ], true);

    $('emp-search').addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      Array.prototype.slice.call($('emp-list').children).forEach(function (row) {
        var hay = ['name', 'dept', 'rank'].map(function (k) { return row.querySelector('[data-k="' + k + '"]').value; }).join(' ').toLowerCase();
        row.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
      });
    });
    $('emp-add').addEventListener('click', function () {
      var wrap = document.createElement('div'); wrap.innerHTML = empRowHTML({ id: uid('e') });
      var row = wrap.firstChild; $('emp-list').insertBefore(row, $('emp-list').firstChild);
      row.querySelector('[data-k="name"]').focus();
    });
    $('emp-list').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del]'); if (del) del.closest('.seat-manage-row').remove();
    });
    $('emp-exp').addEventListener('click', function () {
      var lines = ['이름,부서명,직급'];
      (STATE.employees || []).forEach(function (e) { lines.push([e.name, e.dept, e.rank].map(csvCell).join(',')); });
      downloadFile('임직원_' + stamp() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
      toast('임직원 CSV를 내보냈습니다', 'ok');
    });
    var empFile = $('emp-file');
    $('emp-imp').addEventListener('click', function () { empFile.click(); });
    empFile.addEventListener('change', function () {
      var file = empFile.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var rows = parseCSV(reader.result);
          if (rows.length < 2) { toast('가져올 데이터가 없습니다', 'err'); return; }
          var hdr = rows[0].map(function (h) { return h.trim().toLowerCase(); });
          function col(keys) { for (var i = 0; i < hdr.length; i++) { for (var k = 0; k < keys.length; k++) if (hdr[i].indexOf(keys[k]) !== -1) return i; } return -1; }
          var ci = { name: col(['이름', 'name']), dept: col(['본부', '부서', 'dept']), rank: col(['직급', '직위', 'rank', 'grade']) };
          if (ci.name === -1) { toast('“이름” 열을 찾을 수 없습니다', 'err'); return; }
          pushHistory();
          var map = {}; (STATE.employees || []).forEach(function (e) { map[e.name] = e; });
          var added = 0;
          for (var i = 1; i < rows.length; i++) {
            var r = rows[i]; var name = (r[ci.name] || '').trim(); if (!name) continue;
            var dept = ci.dept > -1 ? (r[ci.dept] || '').trim() : '';
            var rank = ci.rank > -1 ? (r[ci.rank] || '').trim() : '';
            if (map[name]) { map[name].dept = dept; map[name].rank = rank; }
            else { var ne = { id: uid('e'), name: name, dept: dept, rank: rank }; map[name] = ne; (STATE.employees = STATE.employees || []).push(ne); }
            added++;
          }
          save(); closeModal(); empManagerModal();
          toast(added + '명 가져왔습니다', 'ok');
        } catch (err) { toast('CSV를 읽을 수 없습니다', 'err'); }
      };
      reader.readAsText(file, 'utf-8'); empFile.value = '';
    });
  }

  /* ── 현황 통계 ───────────────────────────────────────────── */
  function statsModal() {
    var deskAll = STATE.items.filter(function (it) { return it.type === 'desk'; });
    var totalSeats = deskAll.length, totalOcc = deskAll.filter(function (d) { return d.occupied; }).length;
    var pct = totalSeats ? Math.round(totalOcc / totalSeats * 100) : 0;
    function card(l, v, s) { return '<div class="seat-stat-card"><div class="seat-stat-card__label">' + l + '</div><div class="seat-stat-card__val">' + v + '</div><div class="seat-stat-card__sub">' + esc(s) + '</div></div>'; }
    function bar(name, color, p, valtext, dot) {
      return '<div class="seat-bar-row"><div class="seat-bar-row__name">' + (dot ? '<span class="dot" style="background:' + esc(color) + '"></span>' : '') + esc(name) + '</div>' +
        '<div class="seat-bar-track"><div class="seat-bar-fill" style="width:' + p + '%;background:' + esc(color) + '"></div></div>' +
        '<div class="seat-bar-row__val">' + esc(valtext) + '</div></div>';
    }
    var cards = '<div class="seat-stat-grid">' + card('총 좌석', totalSeats + '석', '') + card('재석', totalOcc + '명', pct + '% 점유') + card('공석', (totalSeats - totalOcc) + '석', '') + '</div>';
    var floorRows = STATE.floors.map(function (f) {
      var d = deskAll.filter(function (x) { return x.floorId === f.id; });
      var occ = d.filter(function (x) { return x.occupied; }).length, t = d.length, p = t ? Math.round(occ / t * 100) : 0;
      return bar(f.name, '#3E6AE1', p, occ + ' / ' + t + '석 (' + p + '%)');
    }).join('');
    var deptRows = STATE.depts.map(function (dp) {
      var cnt = deskAll.filter(function (x) { return x.deptId === dp.id && x.occupied; }).length;
      return { cnt: cnt, html: bar(dp.name, dp.color, totalOcc ? Math.round(cnt / totalOcc * 100) : 0, cnt + '명', true) };
    }).filter(function (x) { return x.cnt > 0; }).sort(function (a, b) { return b.cnt - a.cnt; }).map(function (x) { return x.html; }).join('');
    openModal('재석 현황', cards +
      '<div class="seat-stat-h">층별 점유율</div>' + floorRows +
      '<div class="seat-stat-h">부서별 인원 (재석 기준)</div>' + deptRows,
      [{ label: '닫기', onClick: closeModal }], true);
  }

  /* ── 전체 명단 (검색·모바일 찾기) ────────────────────────── */
  function listModal() {
    var rows = STATE.items.filter(function (it) { return it.type === 'desk' && it.occupied && it.name; }).map(function (it) {
      var dp = deptById(it.deptId), f = floorById(it.floorId);
      return { name: it.name, dept: dp ? dp.name : '', color: dp ? dp.color : '#ccc', rank: it.title || '', floor: f ? f.name : '', floorId: it.floorId, id: it.id, seatNo: it.seatNo || '' };
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    openModal('전체 명단 (' + rows.length + '명)',
      '<div class="seat-list-search"><input id="list-q" class="seat-inp" placeholder="이름·부서·직급·층 검색" autocomplete="off"></div>' +
      '<div class="seat-list" id="list-body"></div>',
      [{ label: '닫기', onClick: closeModal }], true);
    function draw(q) {
      q = (q || '').trim().toLowerCase();
      var body = $('list-body');
      var f = rows.filter(function (r) { return !q || (r.name + ' ' + r.dept + ' ' + r.rank + ' ' + r.floor).toLowerCase().indexOf(q) !== -1; });
      if (!f.length) { body.innerHTML = '<div class="seat-list__empty">검색 결과가 없습니다</div>'; return; }
      body.innerHTML = f.map(function (r) {
        return '<button class="seat-list__row" data-id="' + r.id + '" data-fl="' + r.floorId + '" style="--seat-color:' + esc(r.color) + '">' +
          '<span class="seat-list__nm">' + esc(r.name) + '</span>' +
          '<span class="seat-list__dept">' + esc(r.dept) + (r.rank ? ' · ' + esc(r.rank) : '') + '</span>' +
          '<span class="seat-list__loc">' + esc(r.floor) + (r.seatNo ? ' ' + esc(r.seatNo) : '') + '</span></button>';
      }).join('');
    }
    draw('');
    $('list-q').addEventListener('input', function () { draw(this.value); });
    $('list-body').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (!b) return;
      var it = itemById(b.dataset.id); closeModal();
      if (b.dataset.fl !== curFloorId) curFloorId = b.dataset.fl;
      searchInput.value = it ? it.name : ''; searchQ = (it ? it.name : '').toLowerCase();
      searchWrap.classList.toggle('seat-search--filled', !!searchQ);
      render(); if (it) centerOn(it); updateUrl();
    });
    setTimeout(function () { var q = $('list-q'); if (q) q.focus(); }, 50);
  }

  /* ── 공유 링크 (?q=이름&floor=층) ────────────────────────── */
  function updateUrl() {
    try {
      var parts = [];
      if (searchQ) parts.push('q=' + encodeURIComponent(searchInput.value.trim()));
      if (curFloor()) parts.push('floor=' + encodeURIComponent(curFloor().name));
      history.replaceState(null, '', location.pathname + (parts.length ? '?' + parts.join('&') : ''));
    } catch (e) {}
  }
  function applyUrlQuery() {
    try {
      var u = new URLSearchParams(location.search);
      var fl = u.get('floor'), q = u.get('q');
      if (fl) { var f = STATE.floors.find(function (x) { return x.name === fl || x.id === fl; }); if (f) curFloorId = f.id; }
      if (q) {
        searchInput.value = q; searchQ = q.toLowerCase(); searchWrap.classList.add('seat-search--filled');
        var found = curItems().filter(function (it) { return it.type === 'desk' && matchSearch(it) && passFilter(it); })[0];
        if (!found) {
          STATE.floors.some(function (ff) {
            var d = STATE.items.filter(function (it) { return it.floorId === ff.id && it.type === 'desk' && matchSearch(it) && passFilter(it); })[0];
            if (d) { curFloorId = ff.id; found = d; return true; } return false;
          });
        }
        render(); if (found) centerOn(found);
        return true;
      }
      if (fl) { render(); fitToScreen(); return true; }
    } catch (e) {}
    return false;
  }

  /* ── 미배치 임직원 패널 (드래그 배치) ────────────────────── */
  var sidePanelOpen = false;
  function seatedNames() {
    var s = {}; STATE.items.forEach(function (it) { if (it.type === 'desk' && it.occupied && it.name) s[it.name] = true; }); return s;
  }
  function refreshUnseated() {
    var listEl = $('seat-side-list'); if (!listEl) return;
    var seated = seatedNames();
    var unseated = (STATE.employees || []).filter(function (e) { return !seated[e.name]; });
    $('seat-side-cnt').textContent = unseated.length;
    var q = ($('seat-side-search').value || '').trim().toLowerCase();
    var arr = unseated.filter(function (e) { return !q || (e.name + ' ' + e.dept + ' ' + e.rank).toLowerCase().indexOf(q) !== -1; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    if (!arr.length) { listEl.innerHTML = '<div class="seat-side__empty">' + (q ? '검색 결과가 없습니다' : '모든 임직원이 배치되었습니다 🎉') + '</div>'; return; }
    listEl.innerHTML = arr.map(function (e) {
      var d = deptByName(e.dept), col = d ? d.color : '#8E8E8E';
      return '<div class="seat-side__item" draggable="true" data-name="' + esc(e.name) + '" style="--seat-color:' + esc(col) + '">' +
        '<span class="seat-side__item-name">' + esc(e.name) + '</span>' +
        '<span class="seat-side__item-sub">' + esc(e.dept) + (e.rank ? '<br>' + esc(e.rank) : '') + '</span></div>';
    }).join('');
  }
  function openUnseated() { sidePanelOpen = true; $('seat-side').hidden = false; refreshUnseated(); }
  function closeUnseated() { sidePanelOpen = false; $('seat-side').hidden = true; }
  function seatEmployee(name, pt, targetId) {
    if (!name) return;
    var e = empByName(name), deptId = '', title = '';
    if (e) { var d = deptByName(e.dept); deptId = d ? d.id : ''; title = e.rank || ''; }
    pushHistory();
    var target = targetId ? itemById(targetId) : null;
    if (target && target.type === 'desk' && !target.occupied) {
      target.name = name; target.occupied = true; target.deptId = deptId; target.title = title;
    } else {
      STATE.items.push({ id: uid('s'), floorId: curFloorId, type: 'desk',
        x: snap(pt.x - DESK_W / 2), y: snap(pt.y - DESK_H / 2), w: DESK_W, h: DESK_H,
        seatNo: '', name: name, deptId: deptId, title: title, occupied: true, z: 5 });
    }
    save(); render(); refreshUnseated(); toast(name + ' 배치됨', 'ok');
  }

  /* ── 데이터 복구 (브라우저에 남은 모든 버전 스캔) ────────── */
  function recoverModal() {
    var found = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!/^wylie_seating/.test(k)) continue;
        try {
          var raw = localStorage.getItem(k);
          var j = JSON.parse(raw);
          if (j && j.items && j.floors) {
            found.push({
              key: k, raw: raw,
              floors: j.floors.length,
              desks: j.items.filter(function (x) { return x.type === 'desk'; }).length,
              occ: j.items.filter(function (x) { return x.type === 'desk' && x.occupied; }).length,
              updatedAt: j.updatedAt || 0,
            });
          }
        } catch (e) {}
      }
    } catch (e) {}
    found.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var html;
    if (!found.length) {
      html = '<div class="seat-list__empty">이 브라우저에서 저장된 데이터를 찾지 못했습니다.<br><br>' +
        '• JSON 백업 파일이 있으면 <b>📥 백업 복원</b>을 사용하세요.<br>' +
        '• 공유 서버(start-server.bat)로 쓰셨다면 폴더의 <b>data.state.json</b> 파일을 확인하세요.<br>' +
        '• <b>다른 브라우저</b>로 편집했었는지도 확인해 주세요.</div>';
    } else {
      html = '<div class="seat-pw-hint" style="margin-bottom:10px">이 브라우저에서 발견된 저장본입니다. 좌석 수·시각을 보고 되살릴 항목을 고르세요.</div>' +
        found.map(function (f) {
          var when = f.updatedAt ? new Date(f.updatedAt).toLocaleString('ko-KR') : '저장 시각 미상';
          var cur = (f.key === STORE_KEY) ? ' <span style="color:var(--blue)">(현재 사용 중)</span>' : '';
          return '<div class="seat-manage-row"><div style="flex:1;min-width:0">' +
            '<b>' + esc(f.key) + '</b>' + cur + '<br>' +
            '<span style="font-size:12px;color:var(--text-3)">층 ' + f.floors + ' · 좌석 ' + f.desks + '개(재석 ' + f.occ + ') · ' + esc(when) + '</span>' +
            '</div><button class="ui-btn ui-btn--sm" data-rk="' + esc(f.key) + '">이걸로 복구</button></div>';
        }).join('');
    }
    openModal('데이터 복구', html, [{ label: '닫기', onClick: closeModal }], true);
    mBody.onclick = function (e) {
      var b = e.target.closest('[data-rk]'); if (!b) return;
      var f = found.filter(function (x) { return x.key === b.dataset.rk; })[0]; if (!f) return;
      if (!confirm('"' + b.dataset.rk + '" 저장본으로 되살릴까요?\n(현재 화면은 필요하면 먼저 💾 백업 내보내기 하세요)')) return;
      pushHistory();
      var j = JSON.parse(f.raw);
      if (!j.employees) j.employees = (window.SEAT_SEED && window.SEAT_SEED.employees) || [];
      STATE = j;
      if (!floorById(curFloorId)) curFloorId = STATE.floors[0].id;
      save(); render(); fitToScreen(); closeModal();
      toast('복구했습니다', 'ok');
    };
  }

  /* ── 자동 백업에서 복구 ──────────────────────────────────── */
  function autoBackupModal() {
    var arr = readBackups().slice().reverse();   // 최신순
    var html;
    if (!arr.length) {
      html = '<div class="seat-list__empty">아직 자동 백업이 없습니다.<br>편집 후 저장하면 이 목록에 쌓입니다.</div>';
    } else {
      html = '<div class="seat-pw-hint" style="margin-bottom:10px">저장 시점마다 자동 보관된 스냅샷입니다. 되살릴 시점을 고르세요.<br>(복구 전 현재 상태도 자동 백업되므로 되돌릴 수 있습니다)</div>' +
        arr.map(function (b, i) {
          var info = '';
          try {
            var j = JSON.parse(b.data);
            var desks = j.items.filter(function (x) { return x.type === 'desk'; });
            info = '층 ' + j.floors.length + ' · 좌석 ' + desks.length + '개(재석 ' + desks.filter(function (x) { return x.occupied; }).length + ')';
          } catch (e) { info = '(내용 확인 불가)'; }
          return '<div class="seat-manage-row"><div style="flex:1;min-width:0">' +
            '<b>' + esc(fmtDate(b.ts)) + '</b>' + (i === 0 ? ' <span style="color:var(--blue)">(가장 최근)</span>' : '') + '<br>' +
            '<span style="font-size:12px;color:var(--text-3)">' + esc(info) + '</span>' +
            '</div><button class="ui-btn ui-btn--sm" data-bk="' + b.ts + '">이 시점으로</button></div>';
        }).join('');
    }
    openModal('자동 백업에서 복구', html, [{ label: '닫기', onClick: closeModal }], true);
    mBody.onclick = function (e) {
      var btn = e.target.closest('[data-bk]'); if (!btn) return;
      var b = arr.filter(function (x) { return String(x.ts) === btn.dataset.bk; })[0]; if (!b) return;
      if (!confirm(fmtDate(b.ts) + ' 시점으로 되살릴까요?')) return;
      pushHistory();
      try {
        var j = JSON.parse(b.data);
        if (!j.employees) j.employees = (window.SEAT_SEED && window.SEAT_SEED.employees) || [];
        STATE = j;
        if (!floorById(curFloorId)) curFloorId = STATE.floors[0].id;
        save(); render(); fitToScreen(); closeModal();
        toast('복구했습니다', 'ok');
      } catch (err) { toast('복구 실패', 'err'); }
    };
  }

  /* ── 컨텍스트 메뉴 ───────────────────────────────────────── */
  function showCtx(id, clientX, clientY) {
    var it = itemById(id); if (!it) return;
    var multi = selection.length >= 2 && selection.indexOf(id) !== -1;
    var anyLocked = selection.map(itemById).filter(Boolean).some(function (x) { return x.locked; });
    var alignBlock = multi ? (
      '<div class="seat-ctx__label">정렬</div>' +
      '<div class="seat-ctx__align">' +
        '<button class="seat-ctx__ab" data-al="left" title="왼쪽 맞춤">⬅</button>' +
        '<button class="seat-ctx__ab" data-al="hcenter" title="가로 가운데">↔</button>' +
        '<button class="seat-ctx__ab" data-al="right" title="오른쪽 맞춤">➡</button>' +
        '<button class="seat-ctx__ab" data-al="top" title="위 맞춤">⬆</button>' +
        '<button class="seat-ctx__ab" data-al="vcenter" title="세로 가운데">↕</button>' +
        '<button class="seat-ctx__ab" data-al="bottom" title="아래 맞춤">⬇</button>' +
      '</div>' +
      '<button class="seat-ctx__item" data-dist="h">↔ 가로 간격 균등</button>' +
      '<button class="seat-ctx__item" data-dist="v">↕ 세로 간격 균등</button>' +
      '<div class="seat-ctx__sep"></div>'
    ) : '';
    ctxEl.innerHTML =
      alignBlock +
      (multi ? '' : '<button class="seat-ctx__item" data-act="edit">✏️ 수정</button>') +
      '<button class="seat-ctx__item" data-act="copy">📄 복사 (Ctrl+C)</button>' +
      (multi ? '' : '<button class="seat-ctx__item" data-act="dup">⧉ 복제</button>') +
      '<button class="seat-ctx__item" data-act="lock">' + (anyLocked ? '🔓 위치 고정 해제' : '🔒 위치 고정') + '</button>' +
      '<div class="seat-ctx__sep"></div>' +
      '<button class="seat-ctx__item" data-act="front">⬆ 맨 앞으로</button>' +
      '<button class="seat-ctx__item" data-act="back">⬇ 맨 뒤로</button>' +
      '<div class="seat-ctx__sep"></div>' +
      '<button class="seat-ctx__item seat-ctx__item--danger" data-act="del">🗑 삭제</button>';
    ctxEl.hidden = false;
    var cw = 176, ch = ctxEl.offsetHeight || 220;
    ctxEl.style.left = Math.min(clientX, window.innerWidth - cw - 8) + 'px';
    ctxEl.style.top = Math.min(clientY, window.innerHeight - ch - 8) + 'px';
    ctxEl.onclick = function (e) {
      var al = e.target.closest('[data-al]');
      if (al) { alignSel(al.dataset.al); hideCtx(); return; }
      var di = e.target.closest('[data-dist]');
      if (di) { distributeSel(di.dataset.dist); hideCtx(); return; }
      var b = e.target.closest('[data-act]'); if (!b) return;
      var act = b.dataset.act; hideCtx();
      var targets = (selection.length >= 2 && selection.indexOf(id) !== -1) ? selection.slice() : [id];
      if (act === 'edit') openEditFor(id);
      else if (act === 'copy') { if (selection.indexOf(id) === -1) selection = [id]; copySelection(); }
      else if (act === 'dup') duplicateItem(id);
      else if (act === 'lock') toggleLock(targets);
      else if (act === 'del') deleteItems(targets);
      else if (act === 'front') { pushHistory(); var maxZ = Math.max.apply(null, STATE.items.map(function (x) { return x.z || 0; }).concat([0])); targets.forEach(function (t) { var x = itemById(t); if (x) x.z = maxZ + 1; }); save(); render(); }
      else if (act === 'back') { pushHistory(); targets.forEach(function (t) { var x = itemById(t); if (x) x.z = -1; }); save(); render(); }
    };
  }
  function hideCtx() { ctxEl.hidden = true; }

  // 빈 배경 우클릭 → 추가/관리 메뉴
  function showBgCtx(clientX, clientY, pt) {
    var pasteLine = (clipboard && clipboard.items.length)
      ? '<button class="seat-ctx__item" data-add="paste">📋 붙여넣기 (' + clipboard.items.length + '개)</button>' : '';
    ctxEl.innerHTML =
      '<button class="seat-ctx__item" data-add="desk">🪑 좌석 추가</button>' +
      '<button class="seat-ctx__item" data-add="deskbulk">🪑 좌석 여러 개…</button>' +
      '<button class="seat-ctx__item" data-add="zone">▧ 구역 추가</button>' +
      '<button class="seat-ctx__item" data-add="line">— 선 추가</button>' +
      '<button class="seat-ctx__item" data-add="facility">📍 시설 추가</button>' +
      '<button class="seat-ctx__item" data-add="label">🅣 텍스트 추가</button>' +
      '<div class="seat-ctx__sep"></div>' +
      '<button class="seat-ctx__item" data-add="copyfloor">🗂 이 층 전체 복사</button>' +
      pasteLine +
      '<button class="seat-ctx__item" data-add="selectall">☑ 전체 선택</button>' +
      '<div class="seat-ctx__sep"></div>' +
      '<button class="seat-ctx__item" data-add="dept">🏷 부서 관리</button>' +
      '<button class="seat-ctx__item" data-add="floor">🏢 층 관리</button>';
    ctxEl.hidden = false;
    var cw = 168, ch = ctxEl.offsetHeight || 260;
    ctxEl.style.left = Math.min(clientX, window.innerWidth - cw - 8) + 'px';
    ctxEl.style.top = Math.min(clientY, window.innerHeight - ch - 8) + 'px';
    ctxEl.onclick = function (e) {
      var b = e.target.closest('[data-add]'); if (!b) return;
      var a = b.dataset.add; hideCtx();
      if (a === 'desk') addDesk(pt);
      else if (a === 'deskbulk') bulkDeskModal(pt);
      else if (a === 'zone') addZone(pt);
      else if (a === 'line') addLine(pt);
      else if (a === 'facility') addFacility(pt);
      else if (a === 'label') addLabel(pt);
      else if (a === 'copyfloor') copyFloor();
      else if (a === 'paste') pasteClipboard();
      else if (a === 'selectall') { selection = curItems().map(function (it) { return it.id; }); render(); }
      else if (a === 'dept') deptManagerModal();
      else if (a === 'floor') floorManagerModal();
    };
  }

  /* ── 선 끝점 스냅 (가로·세로 선이 끝에서 만나면 합쳐짐) ──── */
  var SNAP_TH = 14;
  function lineEndpoints(it) {
    var o = it.orient || (it.w >= it.h ? 'h' : 'v');
    if (o === 'h') { var cy = it.y + it.h / 2; return [{ x: it.x, y: cy }, { x: it.x + it.w, y: cy }]; }
    var cx = it.x + it.w / 2; return [{ x: cx, y: it.y }, { x: cx, y: it.y + it.h }];
  }
  function otherLineEndpoints(exceptId) {
    var arr = [];
    curItems().forEach(function (o) {
      if (o.type === 'line' && o.id !== exceptId) lineEndpoints(o).forEach(function (p) { arr.push(p); });
    });
    return arr;
  }
  // 이동한 선: 가까운 끝점에 통째로 붙여 코너를 맞춘다
  function snapLineMove(it) {
    if (it.type !== 'line') return;
    var mine = lineEndpoints(it), eps = otherLineEndpoints(it.id), best = null;
    mine.forEach(function (mp) {
      eps.forEach(function (p) {
        var d = Math.abs(mp.x - p.x) + Math.abs(mp.y - p.y);
        if (d <= SNAP_TH && (!best || d < best.d)) best = { d: d, dx: p.x - mp.x, dy: p.y - mp.y };
      });
    });
    if (best) { it.x = Math.round(it.x + best.dx); it.y = Math.round(it.y + best.dy); }
  }
  // 크기 조절한 선: 움직인 끝(우/하단)을 가까운 끝점에 맞춰 길이 조정
  function snapLineResize(it) {
    if (it.type !== 'line') return;
    var o = it.orient || (it.w >= it.h ? 'h' : 'v');
    var end = o === 'h' ? { x: it.x + it.w, y: it.y + it.h / 2 } : { x: it.x + it.w / 2, y: it.y + it.h };
    var eps = otherLineEndpoints(it.id), best = null;
    eps.forEach(function (p) {
      var d = Math.abs(end.x - p.x) + Math.abs(end.y - p.y);
      if (d <= SNAP_TH && (!best || d < best.d)) best = { d: d, p: p };
    });
    if (best) {
      if (o === 'h') it.w = Math.max(2, Math.round(best.p.x - it.x));
      else it.h = Math.max(2, Math.round(best.p.y - it.y));
    }
  }

  /* ── 드래그(이동/리사이즈/마퀴/팬) ───────────────────────── */
  function onPointerDown(e) {
    if (e.button === 2) return;
    var itemEl = e.target.closest('.seat-item');
    var isResize = e.target.classList.contains('seat-resize');
    closePopover(); hideCtx();

    if (!isLocked) {
      if (isResize && itemEl) {
        var rit = itemById(itemEl.dataset.id);
        if (rit.locked) { e.preventDefault(); return; }   // 잠긴 항목은 크기 조절 불가
        drag = { mode: 'resize', id: rit.id, startX: e.clientX, startY: e.clientY, ow: rit.w, oh: rit.h, before: snapshot() };
        e.preventDefault(); bindMove(); return;
      }
      if (itemEl) {
        var id = itemEl.dataset.id;
        if (e.shiftKey) {
          var si = selection.indexOf(id);
          if (si === -1) selection.push(id); else selection.splice(si, 1);
          render();
        } else if (selection.indexOf(id) === -1) { selection = [id]; render(); }
        // 잠긴 항목은 이동 대상에서 제외
        var origins = selection.map(function (sid) { return itemById(sid); }).filter(function (x) { return x && !x.locked; })
          .map(function (x) { return { id: x.id, x: x.x, y: x.y }; });
        if (!origins.length) { e.preventDefault(); return; }   // 선택은 되지만 이동 안 됨
        drag = { mode: 'move', startX: e.clientX, startY: e.clientY, origins: origins, moved: false, before: snapshot() };
        e.preventDefault(); bindMove(); return;
      }
      if (e.button === 1 || spaceDown) {
        drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, opx: panX, opy: panY };
        vp.classList.add('is-panning');
      } else {
        var c = vpToCanvas(e.clientX, e.clientY);
        drag = { mode: 'marquee', startX: e.clientX, startY: e.clientY, cx: c.x, cy: c.y, additive: e.shiftKey };
        marqueeEl.hidden = false;
      }
      e.preventDefault(); bindMove(); return;
    }

    // 보기 모드
    if (itemEl) {
      var vit = itemById(itemEl.dataset.id);
      if (vit && vit.type === 'desk') { openPopover(vit, e.clientX, e.clientY); return; }
      return;
    }
    drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, opx: panX, opy: panY };
    vp.classList.add('is-panning'); bindMove();
  }

  function onPointerMove(e) {
    if (pinch || !drag) return;
    var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (drag.mode === 'pan') { panX = drag.opx + dx; panY = drag.opy + dy; applyTransform(); }
    else if (drag.mode === 'move') {
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      var mdx = dx / zoom, mdy = dy / zoom;
      drag.origins.forEach(function (o) {
        var it = itemById(o.id); if (!it) return;
        it.x = snap(o.x + mdx); it.y = snap(o.y + mdy);
        var el = canvas.querySelector('.seat-item[data-id="' + o.id + '"]');
        if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
      });
    } else if (drag.mode === 'resize') {
      var rit = itemById(drag.id); if (!rit) return;
      // 선·도형은 아주 얇게까지 줄일 수 있게 최소값을 낮춘다
      var minW = (rit.type === 'line' || rit.type === 'shape') ? 2 : 40;
      var minH = (rit.type === 'line' || rit.type === 'shape') ? 2 : 28;
      rit.w = Math.max(minW, snap(drag.ow + dx / zoom));
      rit.h = Math.max(minH, snap(drag.oh + dy / zoom));
      // 선은 리사이즈 방향에 맞춰 orient 자동 갱신
      if (rit.type === 'line') rit.orient = rit.w >= rit.h ? 'h' : 'v';
      var rel = canvas.querySelector('.seat-item[data-id="' + drag.id + '"]');
      if (rel) {
        rel.style.width = rit.w + 'px'; rel.style.height = rit.h + 'px';
        if (rit.type === 'line') { var nl = buildLine(rit); rel.style.backgroundImage = nl.style.backgroundImage; rel.style.backgroundSize = nl.style.backgroundSize; }
      }
    } else if (drag.mode === 'marquee') {
      var c = vpToCanvas(e.clientX, e.clientY);
      var r = vp.getBoundingClientRect();
      marqueeEl.style.left = (Math.min(drag.startX, e.clientX) - r.left) + 'px';
      marqueeEl.style.top = (Math.min(drag.startY, e.clientY) - r.top) + 'px';
      marqueeEl.style.width = Math.abs(e.clientX - drag.startX) + 'px';
      marqueeEl.style.height = Math.abs(e.clientY - drag.startY) + 'px';
      drag.box = { x1: Math.min(drag.cx, c.x), y1: Math.min(drag.cy, c.y), x2: Math.max(drag.cx, c.x), y2: Math.max(drag.cy, c.y) };
    }
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.mode === 'move' && drag.moved) {
      pushSnapshot(drag.before);
      // 이동한 선들 끝점 스냅
      selection.forEach(function (id) { var it = itemById(id); if (it && it.type === 'line') snapLineMove(it); });
      save(); render();
    } else if (drag.mode === 'resize') {
      pushSnapshot(drag.before);
      var rit2 = itemById(drag.id); if (rit2 && rit2.type === 'line') snapLineResize(rit2);
      save(); render();
    } else if (drag.mode === 'marquee') {
      marqueeEl.hidden = true;
      var box = drag.box;
      if (box) {
        var hits = curItems().filter(function (it) {
          return it.x < box.x2 && it.x + it.w > box.x1 && it.y < box.y2 && it.y + it.h > box.y1;
        }).map(function (it) { return it.id; });
        if (drag.additive) hits.forEach(function (id) { if (selection.indexOf(id) === -1) selection.push(id); });
        else selection = hits;
        render();
      }
    }
    vp.classList.remove('is-panning'); drag = null; unbindMove();
  }
  function bindMove() {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }
  function unbindMove() { window.removeEventListener('pointermove', onPointerMove); }

  /* ── 키보드 ───────────────────────────────────────────────── */
  function onKeyDown(e) {
    var ctrl = e.ctrlKey || e.metaKey;
    // Ctrl+S 저장 (브라우저 저장창 차단)
    if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!isLocked) { save(); toast('저장되었습니다', 'ok'); } else { toast('보기 모드입니다'); }
      return;
    }
    if (e.key === 'Escape') { closeModal(); closePopover(); hideCtx(); selection = []; if (!isLocked) render(); return; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '')) return;
    if (e.code === 'Space') { spaceDown = true; if (!isLocked) vp.style.cursor = 'grab'; }
    if (isLocked) return;
    // Ctrl+Z 실행취소 / Ctrl+Shift+Z · Ctrl+Y 다시실행
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redoAction(); else undo(); return; }
    if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redoAction(); return; }
    // 복사 / 붙여넣기 / 잘라내기
    if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); if (selection.length) { copySelection(); deleteItems(selection.slice()); } return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) { e.preventDefault(); deleteItems(selection.slice()); }
    if (selection.length && /^Arrow/.test(e.key)) {
      e.preventDefault();
      pushHistory();
      var step = e.shiftKey ? GRID : 2;
      var dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
      var dy = (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
      selection.forEach(function (id) { var it = itemById(id); if (it && !it.locked) { it.x += dx; it.y += dy; } });
      save(); render();
    }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selection = curItems().map(function (it) { return it.id; }); render(); }
  }
  function onKeyUp(e) { if (e.code === 'Space') { spaceDown = false; vp.style.cursor = ''; } }

  /* ── 검색 ─────────────────────────────────────────────────── */
  function onSearch() {
    searchQ = searchInput.value.trim().toLowerCase();
    searchWrap.classList.toggle('seat-search--filled', !!searchQ);
    render();
    if (searchQ) {
      var hit = curItems().filter(function (it) { return it.type === 'desk' && matchSearch(it) && passFilter(it); })[0];
      if (hit) centerOn(hit);
    }
    updateUrl();
  }
  function centerOn(it) {
    var r = vp.getBoundingClientRect();
    panX = r.width / 2 - (it.x + it.w / 2) * zoom;
    panY = r.height / 2 - (it.y + it.h / 2) * zoom;
    applyTransform();
  }

  /* ── 검색 자동완성 ────────────────────────────────────────── */
  var acItems = [], acIndex = -1;
  function buildSuggestions(q) {
    q = (q || '').trim().toLowerCase();
    if (!q) return [];
    var out = [], placedNames = {};
    // 1) 좌석에 앉아 있는 사람 (바로 그 좌석으로 이동)
    STATE.items.forEach(function (it) {
      if (it.type !== 'desk' || !it.occupied || !it.name) return;
      var dept = deptById(it.deptId), fl = floorById(it.floorId);
      var hay = (it.name + ' ' + (dept ? dept.name : '') + ' ' + (it.title || '') + ' ' + (it.seatNo || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return;
      placedNames[it.name] = true;
      out.push({ type: 'seat', label: it.name, q: it.name,
        sub: [dept ? dept.name : '', it.title || '', fl ? fl.name : ''].filter(Boolean).join(' · '),
        floorId: it.floorId, itemId: it.id });
    });
    // 2) 아직 좌석이 없는 임직원 (미배치)
    (STATE.employees || []).forEach(function (e) {
      if (placedNames[e.name]) return;
      var hay = (e.name + ' ' + (e.dept || '') + ' ' + (e.rank || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return;
      out.push({ type: 'emp', label: e.name, q: e.name,
        sub: [e.dept || '', e.rank || '', '미배치'].filter(Boolean).join(' · ') });
    });
    // 3) 부서명
    STATE.depts.forEach(function (d) {
      if (d.name.toLowerCase().indexOf(q) === -1) return;
      out.push({ type: 'dept', label: d.name, q: d.name, sub: '부서' });
    });
    // 이름 시작 일치를 우선 노출
    out.sort(function (a, b) {
      return (a.label.toLowerCase().indexOf(q) === 0 ? 0 : 1) - (b.label.toLowerCase().indexOf(q) === 0 ? 0 : 1);
    });
    return out.slice(0, 8);
  }
  function renderAC() {
    var ac = $('seat-ac'); if (!ac) return;
    if (!acItems.length) { ac.hidden = true; ac.innerHTML = ''; return; }
    ac.innerHTML = acItems.map(function (s, i) {
      var ic = s.type === 'seat' ? '🪑' : s.type === 'emp' ? '🧑' : '🏷';
      return '<button class="seat-ac__item' + (i === acIndex ? ' is-active' : '') + '" data-i="' + i + '" type="button">' +
        '<span class="seat-ac__ic">' + ic + '</span>' +
        '<span class="seat-ac__tx"><span class="seat-ac__label">' + esc(s.label) + '</span>' +
        '<span class="seat-ac__sub">' + esc(s.sub) + '</span></span></button>';
    }).join('');
    ac.hidden = false;
  }
  function updateAC() {
    acItems = buildSuggestions(searchInput.value);
    acIndex = -1;
    renderAC();
  }
  function hideAC() { acIndex = -1; var ac = $('seat-ac'); if (ac) { ac.hidden = true; ac.innerHTML = ''; } }
  function pickAC(s) {
    if (!s) return;
    hideAC();
    searchInput.value = s.q;
    onSearch();
    if (s.floorId && s.floorId !== curFloorId) { curFloorId = s.floorId; render(); }
    if (s.itemId) { var it = itemById(s.itemId); if (it) centerOn(it); }
  }

  /* ── 와이어업 ─────────────────────────────────────────────── */
  function wire() {
    vp = $('seat-viewport'); canvas = $('seat-canvas');
    floorsEl = $('seat-floors'); legendEl = $('seat-legend'); emptyEl = $('seat-empty');
    lockEl = $('seat-lock'); editToolsEl = $('seat-edit-tools'); marqueeEl = $('seat-marquee');
    searchInput = $('seat-search-input'); searchWrap = $('seat-search');
    zoomVal = $('seat-zoom-val'); ctxEl = $('seat-ctx'); popEl = $('seat-pop');
    mBackdrop = $('seat-modal-backdrop'); mTitle = $('seat-modal-title'); mBody = $('seat-modal-body'); mFt = $('seat-modal-ft');

    $('seat-zoom-in').addEventListener('click', function () { setZoom(zoom + 0.15); });
    $('seat-zoom-out').addEventListener('click', function () { setZoom(zoom - 0.15); });
    $('seat-zoom-fit').addEventListener('click', fitToScreen);

    searchInput.addEventListener('input', function () { onSearch(); updateAC(); });
    searchInput.addEventListener('focus', function () { if (searchInput.value.trim()) updateAC(); });
    searchInput.addEventListener('keydown', function (e) {
      var ac = $('seat-ac');
      if (ac.hidden || !acItems.length) {
        if (e.key === 'Enter' && acItems.length === 0) { updateAC(); }
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); acIndex = (acIndex + 1) % acItems.length; renderAC(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); acIndex = (acIndex - 1 + acItems.length) % acItems.length; renderAC(); }
      else if (e.key === 'Enter') { e.preventDefault(); pickAC(acItems[acIndex >= 0 ? acIndex : 0]); }
      else if (e.key === 'Escape') { hideAC(); }
    });
    $('seat-ac').addEventListener('mousedown', function (e) {
      var b = e.target.closest('[data-i]'); if (!b) return;
      e.preventDefault(); pickAC(acItems[+b.dataset.i]);
    });
    searchInput.addEventListener('blur', function () { setTimeout(hideAC, 150); });
    $('seat-search-clear').addEventListener('click', function () { searchInput.value = ''; onSearch(); hideAC(); searchInput.focus(); });

    $('seat-btn-edit').addEventListener('click', promptUnlock);
    $('seat-btn-done').addEventListener('click', exitEdit);
    $('seat-add-desk').addEventListener('click', function () { addDesk(); });
    $('seat-add-desk-bulk').addEventListener('click', function () { bulkDeskModal(); });
    $('seat-add-zone').addEventListener('click', function () { addZone(); });
    $('seat-add-line').addEventListener('click', function () { addLine(); });
    $('seat-add-facility').addEventListener('click', function () { addFacility(); });
    $('seat-add-label').addEventListener('click', function () { addLabel(); });
    $('seat-mng-emp').addEventListener('click', empManagerModal);
    $('seat-mng-dept').addEventListener('click', deptManagerModal);
    $('seat-mng-floor').addEventListener('click', floorManagerModal);
    $('seat-btn-data').addEventListener('click', dataModal);
    $('seat-btn-print').addEventListener('click', function () { window.print(); });

    // 명단 / 현황 (보기·편집 공통)
    $('seat-btn-list').addEventListener('click', listModal);
    $('seat-btn-stats').addEventListener('click', statsModal);

    // 미배치 임직원 패널
    $('seat-btn-unseated').addEventListener('click', function () { if (sidePanelOpen) closeUnseated(); else openUnseated(); });
    $('seat-side-close').addEventListener('click', closeUnseated);
    $('seat-side-search').addEventListener('input', refreshUnseated);
    $('seat-side-list').addEventListener('dragstart', function (e) {
      var it = e.target.closest('.seat-side__item'); if (!it) return;
      e.dataTransfer.setData('text/plain', it.dataset.name); e.dataTransfer.effectAllowed = 'copy';
      it.classList.add('dragging');
    });
    $('seat-side-list').addEventListener('dragend', function (e) {
      var it = e.target.closest('.seat-side__item'); if (it) it.classList.remove('dragging');
    });
    vp.addEventListener('dragover', function (e) { if (isLocked) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; vp.classList.add('drop-active'); });
    vp.addEventListener('dragleave', function (e) { if (e.target === vp) vp.classList.remove('drop-active'); });
    vp.addEventListener('drop', function (e) {
      if (isLocked) return;
      e.preventDefault(); vp.classList.remove('drop-active');
      var name = e.dataTransfer.getData('text/plain'); if (!name || name.indexOf('floor:') === 0) return;
      var targetEl = e.target.closest('.seat-desk');
      seatEmployee(name, vpToCanvas(e.clientX, e.clientY), targetEl ? targetEl.dataset.id : null);
    });

    document.querySelectorAll('[data-seat-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
    mBackdrop.addEventListener('mousedown', function (e) { if (e.target === mBackdrop) closeModal(); });

    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('dblclick', function (e) {
      var itemEl = e.target.closest('.seat-item');
      if (itemEl && !isLocked) openEditFor(itemEl.dataset.id);
    });
    vp.addEventListener('contextmenu', function (e) {
      if (isLocked) return;
      var itemEl = e.target.closest('.seat-item');
      e.preventDefault();
      if (itemEl) {
        var rid = itemEl.dataset.id;
        // 이미 다중 선택된 항목 위에서 우클릭하면 선택 유지(정렬 메뉴용)
        if (selection.indexOf(rid) === -1) { selection = [rid]; render(); }
        showCtx(rid, e.clientX, e.clientY);
      }
      else { showBgCtx(e.clientX, e.clientY, vpToCanvas(e.clientX, e.clientY)); }
    });
    vp.addEventListener('wheel', function (e) {
      e.preventDefault();
      var r = vp.getBoundingClientRect();
      setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    // 모바일: 두 손가락 핀치 줌
    function tDist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function tMid(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }
    vp.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) { drag = null; unbindMove(); vp.classList.remove('is-panning'); pinch = { d: tDist(e.touches) || 1, z: zoom }; }
    }, { passive: false });
    vp.addEventListener('touchmove', function (e) {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        var nd = tDist(e.touches); var m = tMid(e.touches); var r = vp.getBoundingClientRect();
        setZoom(pinch.z * (nd / pinch.d), m.x - r.left, m.y - r.top);
      }
    }, { passive: false });
    vp.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinch = null; });

    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('#seat-ctx')) hideCtx();
      if (!e.target.closest('#seat-pop') && !e.target.closest('.seat-desk')) closePopover();
    }, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // 상태 로드(서버 자동 감지) 후 렌더
    initState().then(function () {
      curFloorId = STATE.floors[0].id;
      render();
      fitToScreen();
      if (applyUrlQuery()) { /* 공유 링크로 진입 */ } // 검색/층 자동 적용
      if (MODE === 'server') startPolling();
      if (MODE === 'server') {
        var badge = document.getElementById('seat-brand-sub');
        if (badge) badge.textContent = '실시간 공유';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
