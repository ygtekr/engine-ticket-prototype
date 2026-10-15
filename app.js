'use strict';
/* MD Bilet – çevrimdışı öncelikli makine dairesi arıza/bakım bileti prototipi.
   Depolama: IndexedDB. Senkronizasyon: zaman damgalı outbox kuyruğu + simüle gemi sunucusu. */

// ---------- Sabitler ----------
const SHIP_ID = 'EKER-01';
const CREW = SEED.crew;
const ROLES = {
  yagci: { label: 'Yağcı (Oiler)', who: CREW.yagci, canCreate: true, canWork: true },
  c34: { label: '3./4. Çarkçı (3rd/4th Eng.)', who: CREW.c3, canCreate: true, canWork: true },
  c2: { label: '2. Çarkçı (2nd Eng.)', who: CREW.c2, canCreate: false, canWork: true, canAssign: true },
  chief: { label: 'Çarkçıbaşı (Chief Engineer)', who: CREW.chief, canCreate: false, canClose: true }
};
const STATUS = {
  acik: 'Açık – atama bekliyor', atandi: 'Atandı – işlemde', tamamlandi: 'Tamamlandı – onay bekliyor',
  karaya: 'Karaya iletildi (Superintendent)', kapandi: 'Kapandı'
};
const STATUS_SHORT = { acik: 'Açık', atandi: 'Atandı', tamamlandi: 'Onay bekliyor', karaya: 'Karada', kapandi: 'Kapandı' };
const PRIO = { acil: 'Acil', rutin: 'Rutin', psc: 'PSC Eksikliği' };

// ---------- Yardımcılar ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ts => new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'şimdi'; if (m < 60) return m + ' dk önce';
  const h = Math.round(m / 60); if (h < 24) return h + ' sa önce';
  return Math.round(h / 24) + ' gün önce';
}
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
function openModal(html) { $('#modalCard').innerHTML = html; $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; $('#modalCard').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
const role = () => localStorage.getItem('role') || 'yagci';
const isOnline = () => navigator.onLine && localStorage.getItem('forceOffline') !== '1';
const deviceId = (() => { let d = localStorage.getItem('deviceId'); if (!d) { d = 'TAB-' + Math.random().toString(36).slice(2, 7).toUpperCase(); localStorage.setItem('deviceId', d); } return d; })();

// ---------- IndexedDB ----------
let db;
const rq = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('md-bilet', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('equipment', { keyPath: 'id' });
      d.createObjectStore('tickets', { keyPath: 'id' }).createIndex('equipmentId', 'equipmentId');
      d.createObjectStore('parts', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
      d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true }).createIndex('synced', 'synced');
      d.createObjectStore('syncLog', { keyPath: 'id', autoIncrement: true });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const getAll = s => rq(db.transaction(s).objectStore(s).getAll());
const get = (s, k) => rq(db.transaction(s).objectStore(s).get(k));
function write(entries) { // [[store, value]] tek atomik işlemde
  return new Promise((res, rej) => {
    const stores = [...new Set(entries.map(e => e[0]))];
    const t = db.transaction(stores, 'readwrite');
    entries.forEach(([s, v]) => t.objectStore(s).put(v));
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const pendingCount = () => rq(db.transaction('outbox').objectStore('outbox').index('synced').count(IDBKeyRange.only(0)));
function outboxEntry(entity, entityId, op, changes) {
  return ['outbox', { ts: Date.now(), deviceId, role: role(), user: ROLES[role()].who, entity, entityId, op, changes, synced: 0 }];
}

async function seedIfNeeded() {
  const m = await get('meta', 'seeded');
  if (m) return;
  const e = [];
  SEED.equipment.forEach(x => e.push(['equipment', x]));
  SEED.parts.forEach(x => e.push(['parts', x]));
  SEED.tickets.forEach(x => e.push(['tickets', x]));
  e.push(['meta', { key: 'seeded', at: Date.now() }], ['meta', { key: 'ticketSeq', value: SEED.tickets.length }]);
  await write(e);
}
async function nextTicketId() {
  const m = await get('meta', 'ticketSeq'); const n = (m?.value || 0) + 1;
  return { id: 'TKT-' + String(n).padStart(4, '0'), meta: ['meta', { key: 'ticketSeq', value: n }] };
}

// ---------- Ortak veri ----------
let EQ = [], EQMAP = {}, PARTS = {}, TICKETS = [];
async function loadAll() {
  [EQ, TICKETS] = await Promise.all([getAll('equipment'), getAll('tickets')]);
  EQ.sort((a, b) => a.sfi.localeCompare(b.sfi, 'tr', { numeric: true }));
  EQMAP = Object.fromEntries(EQ.map(e => [e.id, e]));
  PARTS = Object.fromEntries((await getAll('parts')).map(p => [p.id, p]));
  TICKETS.sort((a, b) => b.updatedAt - a.updatedAt);
}
const eqLabel = id => EQMAP[id] ? `${EQMAP[id].sfi} · ${EQMAP[id].name}` : id;

// ---------- QR ----------
function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }
function parseScanned(txt) { const m = String(txt).match(/EQ-[0-9.]+/); return m && EQMAP[m[0]] ? m[0] : null; }

// ---------- Kural tabanlı "AI" öneri ----------
const STOP = new Set('ve ile bir bu şu da de çok var yok için gibi olan oldu sonra daha ama ki mi ne en no nolu tam az fazla diğer kontrol edilmeli edildi ediyor geliyor yapıyor değil olarak üzerinde'.split(' '));
function words(s) {
  return (s || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
}
const stem = w => w.slice(0, 5); // kaba Türkçe kök: ilk 5 harf (kaçağı ≈ kaçak, sıcaklığı ≈ sıcaklık)
const tokens = s => [...new Set(words(s).map(stem))];
function suggest(eqId, text, excludeId) {
  const qw = words(text); const qt = [...new Set(qw.map(stem))]; const shown = st => qw.find(w => stem(w) === st) || st; const grp = EQMAP[eqId]?.sfi.split('.')[0];
  return TICKETS.filter(t => t.id !== excludeId && t.resolution && ['kapandi', 'tamamlandi', 'karaya'].includes(t.status)).map(t => {
    let score = 0; const why = [];
    if (eqId && t.equipmentId === eqId) { score += 5; why.push('Aynı ekipman'); }
    else if (grp && EQMAP[t.equipmentId]?.sfi.split('.')[0] === grp) { score += 2; why.push('Aynı sistem (SFI ' + grp + ')'); }
    const tt = tokens(t.title + ' ' + t.description);
    const common = qt.filter(w => tt.includes(w));
    if (common.length) { score += common.length * 1.5; why.push('Ortak kelime: ' + common.map(shown).join(', ')); }
    return { t, score, why };
  }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 3);
}
function suggestionHtml(list) {
  const head = `<h3>💡 Benzer geçmiş arızalar</h3><div class="small muted">Basit kural tabanlı öneri (aynı ekipman / sistem + ortak anahtar kelimeler). Cihazda çalışır, internet ve yapay zekâ modeli kullanmaz.</div>`;
  if (!list.length) return head + `<div class="sug muted">Henüz eşleşen geçmiş bilet yok. Ekipman seçip arızayı tarif ettikçe öneriler burada görünür.</div>`;
  return head + list.map(({ t, score, why }) => `<div class="sug"><span class="score">${score.toFixed(1)}</span>
    <b>${esc(t.id)} · ${esc(t.title)}</b><div class="small muted">${esc(eqLabel(t.equipmentId))} · ${fmt(t.createdAt)}</div>
    <div class="why">${why.map(w => `<span>${esc(w)}</span>`).join('')}</div>
    <div><b>Çözüm:</b> ${esc(t.resolution)}</div>
    ${t.partsUsed?.length ? `<div class="small muted">Kullanılan parça: ${t.partsUsed.map(p => esc(PARTS[p.partId]?.name || p.partId) + ' ×' + p.qty).join(', ')}</div>` : ''}</div>`).join('');
}

// ---------- Ortak bileşenler ----------
const prioBadge = p => p ? `<span class="badge b-${p}">${PRIO[p]}</span>` : `<span class="badge b-none">Öncelik yok</span>`;
const statusBadge = s => `<span class="badge s-${s}">${STATUS_SHORT[s]}</span>`;
let PENDING_IDS = new Set();
function ticketCard(t) {
  return `<a class="card link" href="#/bilet/${t.id}">
    <div class="tk-head"><span class="mono small muted">${t.id}${PENDING_IDS.has(t.id) ? ' · <span style="color:var(--accent)">⇅ senkron bekliyor</span>' : ''}</span>${statusBadge(t.status)}</div>
    <div class="tk-title">${esc(t.title)}</div>
    <div class="small muted">${esc(eqLabel(t.equipmentId))}</div>
    <div class="tk-meta" style="margin-top:8px">${prioBadge(t.priority)}<span class="small muted">${t.type === 'bakim' ? 'Bakım' : 'Arıza'} · ${ago(t.updatedAt)}${t.assignedTo ? ' · 👷 ' + esc(t.assignedTo) : ''}</span></div>
  </a>`;
}
function myQueue(t, r) {
  if (r === 'c2') return t.status === 'acik' || (t.status === 'atandi' && t.assignedTo === CREW.c2);
  if (r === 'chief') return t.status === 'tamamlandi' || t.status === 'karaya';
  if (r === 'yagci') return t.status === 'atandi' && t.assignedTo === CREW.yagci;
  if (r === 'c34') return t.status === 'atandi' && (t.assignedTo === CREW.c3 || t.assignedTo === CREW.c4);
  return false;
}
const QUEUE_LABEL = { yagci: 'Bana atanan işler', c34: 'Bana atanan işler', c2: 'Atama bekleyen + bendeki işler', chief: 'Onay bekleyen + karadaki işler' };

// ---------- Görünümler ----------
const view = () => $('#view');
let cleanup = null;

async function vTickets(params) {
  const r = role(); const f = params.get('f') || 'benim';
  const counts = { benim: TICKETS.filter(t => myQueue(t, r)).length, tumu: TICKETS.length };
  Object.keys(STATUS).forEach(s => counts[s] = TICKETS.filter(t => t.status === s).length);
  const list = TICKETS.filter(t => f === 'tumu' ? true : f === 'benim' ? myQueue(t, r) : t.status === f);
  const order = { acil: 0, psc: 1, rutin: 2 };
  list.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3) || b.updatedAt - a.updatedAt);
  const tab = (k, l) => `<button class="tab ${f === k ? 'on' : ''}" data-f="${k}">${l}<span class="n">(${counts[k]})</span></button>`;
  view().innerHTML = `
    <h1>Biletler</h1>
    <div class="tabs">${tab('benim', '★ ' + QUEUE_LABEL[r])}${tab('acik', 'Açık')}${tab('atandi', 'Atandı')}${tab('tamamlandi', 'Onay bekliyor')}${tab('karaya', 'Karada')}${tab('kapandi', 'Kapandı')}${tab('tumu', 'Tümü')}</div>
    ${f === 'benim' ? `<div class="info small">Rol: <b>${esc(ROLES[r].label)}</b> — ${esc(QUEUE_LABEL[r])}. Rolü üstten değiştirerek akışı deneyebilirsin.</div>` : ''}
    ${list.length ? list.map(ticketCard).join('') : '<div class="card muted">Bu listede bilet yok.</div>'}
    ${ROLES[r].canCreate ? `<a class="btn primary fab" href="#/yeni">＋ Yeni Bilet</a>` : ''}`;
  $$('.tab', view()).forEach(b => b.onclick = () => location.hash = '#/?f=' + b.dataset.f);
}

function vTree(params) {
  const q = (params.get('q') || '').toLocaleLowerCase('tr');
  const openCount = id => TICKETS.filter(t => t.equipmentId === id && t.status !== 'kapandi').length;
  const roots = EQ.filter(e => !e.parent);
  const match = e => !q || (e.name + ' ' + e.sfi + ' ' + e.id + ' ' + e.maker).toLocaleLowerCase('tr').includes(q);
  view().innerHTML = `
    <h1>Ekipman Ağacı (SFI)</h1>
    <input id="eqSearch" type="search" placeholder="Ara: DG2, pompa, 741…" value="${esc(params.get('q') || '')}">
    <div class="row" style="margin:10px 0 14px"><a class="btn sm" href="#/qr-etiket">🖨 Tüm QR etiketleri</a><a class="btn sm" href="#/tara">⌗ QR okut</a></div>
    ${roots.map(g => {
      const kids = EQ.filter(e => e.parent === g.id).filter(e => match(e) || match(g));
      if (q && !kids.length && !match(g)) return '';
      const gOpen = kids.reduce((s, k) => s + openCount(k.id), openCount(g.id));
      return `<details class="tree-group" ${q || g.id === 'EQ-701' || g.id === 'EQ-711' ? 'open' : ''}>
        <summary><span class="chev">▶</span><span class="sfi">${g.sfi}</span><span style="flex:1">${esc(g.name)}</span>${gOpen ? `<span class="cnt">${gOpen}</span>` : ''}</summary>
        <a class="tree-item" href="#/ekipman/${g.id}"><span class="nm muted">Grup kartı · QR<span class="eid">${g.id}</span></span><span>›</span></a>
        ${kids.map(k => `<a class="tree-item" href="#/ekipman/${k.id}"><span class="sfi">${k.sfi}</span><span class="nm">${esc(k.name)}<span class="eid">${k.id} · ${esc(k.maker)}</span></span>${openCount(k.id) ? `<span class="cnt">${openCount(k.id)}</span>` : ''}<span>›</span></a>`).join('')}
      </details>`;
    }).join('')}
    <p class="small muted">Not: 701 / 711 kodları tasarım notundaki örneklerdir; diğer grup kodları prototip için örnek verilmiştir.</p>`;
  const s = $('#eqSearch'); let tm;
  s.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { history.replaceState(null, '', '#/ekipman?q=' + encodeURIComponent(s.value)); vTree(new URLSearchParams('q=' + encodeURIComponent(s.value))); const n = $('#eqSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}

function vEquipment(id, params) {
  const e = EQMAP[id]; if (!e) { view().innerHTML = '<div class="card">Ekipman bulunamadı: ' + esc(id) + '</div>'; return; }
  const list = TICKETS.filter(t => t.equipmentId === id || EQMAP[t.equipmentId]?.parent === id).sort((a, b) => b.createdAt - a.createdAt);
  const kids = EQ.filter(k => k.parent === id);
  const r = role();
  view().innerHTML = `
    ${params.get('scan') ? `<div class="info">✅ QR okundu: <b class="mono">${esc(id)}</b></div>` : ''}
    <div class="card">
      <div class="row" style="align-items:flex-start"><div style="flex:2">
        <span class="sfi">SFI ${e.sfi}</span>
        <h1 style="margin-top:8px">${esc(e.name)}</h1>
        <div class="small muted">Equipment ID: <b class="mono" style="color:var(--text)">${e.id}</b></div>
        ${e.maker ? `<div class="small muted">Model: ${esc(e.maker)}</div>` : ''}${e.loc ? `<div class="small muted">Konum: ${esc(e.loc)}</div>` : ''}
        ${e.parent ? `<div class="small"><a href="#/ekipman/${e.parent}">↑ ${esc(eqLabel(e.parent))}</a></div>` : ''}
      </div></div>
      <div class="qrbox" style="margin-top:12px">${qrSvg(e.id)}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="printQr">🖨 QR yazdır</button></div>
    </div>
    ${ROLES[r].canCreate ? `<a class="btn primary block" href="#/yeni?eq=${e.id}">＋ Bu ekipman için yeni bilet</a>`
      : `<div class="info small">Bilet açma yetkisi Yağcı ve 3./4. Çarkçı rollerinde. <button class="btn sm" id="swRole">Yağcı rolüne geç</button></div>`}
    ${kids.length ? `<h2>Alt ekipmanlar</h2>${kids.map(k => `<a class="card link" href="#/ekipman/${k.id}"><span class="sfi">${k.sfi}</span> ${esc(k.name)}</a>`).join('')}` : ''}
    <h2>Arıza / bakım geçmişi (${list.length})</h2>
    ${list.length ? list.map(ticketCard).join('') : '<div class="card muted">Bu ekipman için kayıt yok.</div>'}`;
  $('#printQr').onclick = () => { location.hash = '#/qr-etiket?id=' + e.id; };
  $('#swRole') && ($('#swRole').onclick = () => setRole('yagci'));
}

function vLabels(params) {
  const only = params.get('id');
  const list = only ? EQ.filter(e => e.id === only) : EQ;
  view().innerHTML = `<div class="noprint"><h1>QR Etiketleri</h1><p class="muted small">Etiketleri yazdırıp ekipmanın üzerine yapıştırın (yağa dayanıklı laminasyon önerilir). QR içeriği sadece Equipment ID'dir.</p>
    <div class="row" style="margin-bottom:12px"><button class="btn primary" onclick="window.print()">🖨 Yazdır</button>${only ? `<a class="btn" href="#/qr-etiket">Tümü</a>` : ''}</div></div>
    <div class="labels">${list.map(e => `<div class="label"><div class="qrbox">${qrSvg(e.id)}</div><b>${e.id}</b><span>SFI ${e.sfi} · ${esc(e.name)}</span></div>`).join('')}</div>`;
}

let scanner = null;
async function stopScanner() { if (scanner) { try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch (e) { } scanner = null; } }
function vScan() {
  const leaves = EQ;
  view().innerHTML = `
    <h1>QR ile Ekipman Okut</h1>
    <div id="reader"></div>
    <div class="row" style="margin-top:10px"><button class="btn primary" id="startCam">📷 Kamerayı başlat</button><button class="btn" id="stopCam" hidden>Durdur</button></div>
    <label class="btn block" style="margin-top:10px">🖼 Fotoğraftan QR oku<input type="file" accept="image/*" id="qrFile" hidden></label>
    <div id="scanMsg" class="small muted" style="margin-top:8px">Kamera izni gerekir. Kamera yalnızca HTTPS veya localhost üzerinde çalışır.</div>
    <h2>Manuel seçim (QR okunmuyorsa)</h2>
    <select id="manualEq"><option value="">— Ekipman seçin —</option>${leaves.map(e => `<option value="${e.id}">${e.sfi} · ${esc(e.name)}</option>`).join('')}</select>
    <button class="btn block" id="manualGo" style="margin-top:10px">Ekipmanı aç</button>`;
  const found = (txt) => { const id = parseScanned(txt); if (!id) { $('#scanMsg').innerHTML = '<span class="low">Tanınmayan QR: ' + esc(txt) + '</span>'; return false; } stopScanner(); if (navigator.vibrate) navigator.vibrate(120); location.hash = '#/ekipman/' + id + '?scan=1'; return true; };
  $('#startCam').onclick = async () => {
    try {
      scanner = new Html5Qrcode('reader');
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, txt => found(txt), () => { });
      $('#startCam').hidden = true; $('#stopCam').hidden = false; $('#scanMsg').textContent = 'QR etiketini çerçeveye getirin…';
    } catch (err) { $('#scanMsg').innerHTML = '<span class="low">Kamera açılamadı: ' + esc(err?.message || err) + '</span><br>Fotoğraftan okuma veya manuel seçimi kullanın.'; scanner = null; }
  };
  $('#stopCam').onclick = async () => { await stopScanner(); $('#startCam').hidden = false; $('#stopCam').hidden = true; };
  $('#qrFile').onchange = async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { await stopScanner(); const s = new Html5Qrcode('reader'); const txt = await s.scanFile(f, false); s.clear(); found(txt); }
    catch (e) { $('#scanMsg').innerHTML = '<span class="low">Fotoğrafta QR bulunamadı.</span>'; }
  };
  $('#manualGo').onclick = () => { const v = $('#manualEq').value; if (v) location.hash = '#/ekipman/' + v; };
  cleanup = stopScanner;
}

// --- Medya ---
async function compressImage(file, maxDim = 1280, q = 0.6) {
  let img;
  try { img = await createImageBitmap(file); } catch (e) {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const s = Math.min(1, maxDim / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, orig: file.size, w: c.width, h: c.height };
}
const urls = []; const objUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };

function vNew(params) {
  const r = role();
  if (!ROLES[r].canCreate) {
    view().innerHTML = `<h1>Yeni Bilet</h1><div class="warn">Bu rol (${esc(ROLES[r].label)}) bilet açamaz. Bilet açma: Yağcı ve 3./4. Çarkçı.</div>
      <div class="row"><button class="btn primary" data-r="yagci">Yağcı olarak devam</button><button class="btn" data-r="c34">3./4. Çarkçı</button></div>`;
    $$('[data-r]').forEach(b => b.onclick = () => setRole(b.dataset.r)); return;
  }
  const st = { photos: [], audio: null, type: 'ariza' };
  const eq = params.get('eq') || '';
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  view().innerHTML = `
    <h1>Yeni Arıza / Bakım Bileti</h1>
    <div class="seg" id="typeSeg"><button class="on def" data-t="ariza">⚠ Arıza</button><button data-t="bakim">🔧 Bakım</button></div>
    <label class="f" for="nEq">Ekipman</label>
    <div class="row"><select id="nEq" style="flex:3"><option value="">— Seçin —</option>${EQ.filter(e => e.parent).map(e => `<option value="${e.id}" ${e.id === eq ? 'selected' : ''}>${e.sfi} · ${esc(e.name)}</option>`).join('')}</select>
    <a class="btn" href="#/tara" style="flex:none" title="QR okut">⌗</a></div>
    <label class="f" for="nTitle">Kısa başlık</label>
    <input id="nTitle" maxlength="80" placeholder="örn. Yakıt enjektörü kaçağı">
    <label class="f" for="nDesc">Açıklama (belirti, alarm, değerler)</label>
    <textarea id="nDesc" placeholder="Ne gözlemlendi? Sıcaklık, basınç, ses, kaçak yeri…"></textarea>
    <label class="f" for="nTime">Tespit zamanı</label>
    <input id="nTime" type="datetime-local" value="${local}">
    <div class="card ai" id="aiBox" style="margin-top:14px"></div>
    <h2>Fotoğraf ve ses</h2>
    <div class="row"><label class="btn">📷 Fotoğraf<input id="nPhoto" type="file" accept="image/*" capture="environment" multiple hidden></label>
    <button class="btn" id="recBtn">🎙 Ses kaydı</button></div>
    <div id="mediaInfo" class="small muted" style="margin-top:6px">Fotoğraflar cihazda sıkıştırılır (en fazla 1280 px, JPEG %60). Ses kaydı en fazla 60 sn.</div>
    <div class="media-row" id="photoRow"></div><div class="media-row" id="audioRow"></div>
    <button class="btn primary block" id="saveBtn" style="margin-top:20px">✔ Bileti Aç (çevrimdışı kaydedilir)</button>`;
  $$('#typeSeg button').forEach(b => b.onclick = () => { st.type = b.dataset.t; $$('#typeSeg button').forEach(x => x.classList.toggle('on', x === b)); $$('#typeSeg button').forEach(x => x.classList.add('def')); });
  const refreshAI = () => { $('#aiBox').innerHTML = suggestionHtml(suggest($('#nEq').value, $('#nTitle').value + ' ' + $('#nDesc').value)); };
  let tm; ['nEq', 'nTitle', 'nDesc'].forEach(i => $('#' + i).addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(refreshAI, 200); }));
  $('#nEq').addEventListener('change', refreshAI); refreshAI();
  $('#nPhoto').onchange = async ev => {
    for (const f of ev.target.files) {
      const c = await compressImage(f); st.photos.push(c);
      $('#photoRow').insertAdjacentHTML('beforeend', `<div><img src="${objUrl(c.blob)}" alt=""><div class="small muted">${kb(c.orig)} → <b style="color:var(--ok)">${kb(c.blob.size)}</b></div></div>`);
    }
    ev.target.value = '';
  };
  let rec = null, chunks = [], timer = null;
  $('#recBtn').onclick = async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      rec = new MediaRecorder(stream, mt ? { mimeType: mt, audioBitsPerSecond: 24000 } : undefined); chunks = [];
      const t0 = Date.now();
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearInterval(timer); stream.getTracks().forEach(t => t.stop());
        st.audio = { blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), dur: Math.round((Date.now() - t0) / 1000) };
        $('#recBtn').textContent = '🎙 Yeniden kaydet';
        $('#audioRow').innerHTML = `<audio controls src="${objUrl(st.audio.blob)}"></audio><div class="small muted">${st.audio.dur} sn · ${kb(st.audio.blob.size)}</div>`;
      };
      rec.start();
      timer = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); $('#recBtn').innerHTML = `<span class="rec">● ${s} sn</span> Durdur`; if (s >= 60) rec.stop(); }, 500);
      $('#recBtn').innerHTML = '<span class="rec">● 0 sn</span> Durdur';
    } catch (e) { toast('Mikrofon açılamadı: ' + (e.message || e)); }
  };
  cleanup = () => { if (rec && rec.state === 'recording') rec.stop(); };
  $('#saveBtn').onclick = async () => {
    const eqId = $('#nEq').value, title = $('#nTitle').value.trim(), desc = $('#nDesc').value.trim();
    if (!eqId || !title) { toast('Ekipman ve kısa başlık zorunlu'); return; }
    const { id, meta } = await nextTicketId(); const now = Date.now();
    const detectedAt = $('#nTime').value ? new Date($('#nTime').value).getTime() : now;
    const entries = [meta]; const media = [];
    st.photos.forEach((p, i) => { const mid = id + '-F' + (i + 1); media.push(mid); entries.push(['media', { id: mid, ticketId: id, kind: 'photo', blob: p.blob, size: p.blob.size, createdAt: now }], outboxEntry('media', mid, 'create', { ticketId: id, kind: 'photo', size: p.blob.size, w: p.w, h: p.h })); });
    if (st.audio) { const mid = id + '-S1'; media.push(mid); entries.push(['media', { id: mid, ticketId: id, kind: 'audio', blob: st.audio.blob, size: st.audio.blob.size, dur: st.audio.dur, createdAt: now }], outboxEntry('media', mid, 'create', { ticketId: id, kind: 'audio', size: st.audio.blob.size, dur: st.audio.dur })); }
    const t = { id, equipmentId: eqId, type: st.type, title, description: desc, status: 'acik', priority: null, assignedTo: null, partsNeeded: [], partsUsed: [], resolution: '', media,
      createdAt: now, detectedAt, createdBy: ROLES[role()].who, updatedAt: now, version: 1, history: [{ ts: now, role: role(), who: ROLES[role()].who, action: 'Bilet açıldı', note: '' }] };
    const { history, ...snap } = t;
    entries.unshift(['tickets', t], outboxEntry('ticket', id, 'create', snap));
    await write(entries); await refreshData();
    toast('✔ ' + id + ' açıldı – senkron kuyruğunda'); location.hash = '#/bilet/' + id;
  };
}

// --- Bilet detayı ve rol aksiyonları ---
async function updateTicket(t, changes, action, note, extra = []) {
  const now = Date.now();
  Object.assign(t, changes, { updatedAt: now, version: (t.version || 1) + 1 });
  t.history.push({ ts: now, role: role(), who: ROLES[role()].who, action, note: note || '' });
  await write([['tickets', t], outboxEntry('ticket', t.id, 'update', { ...changes, status: t.status, version: t.version, action }), ...extra]);
  await refreshData();
}
function partsPicker(selected) { // selected: [{partId, qty}]
  const sel = Object.fromEntries(selected.map(p => [p.partId, p.qty]));
  const cats = ['Filtre', 'O-ring / Conta', 'Valf', 'Rulman', 'Salmastra', 'Nozul'];
  return `<div id="pp">${cats.map(c => `<h2 style="margin-top:10px">${esc(c)}</h2>${Object.values(PARTS).filter(p => p.cat === c).map(p => `
    <div class="part-line" data-pid="${p.id}"><div class="nm">${esc(p.name)}<div class="small muted">${p.id} · stok ${p.qty} ${p.unit}</div></div>
    <div class="qty"><button type="button" data-d="-1">−</button><b>${sel[p.id] || 0}</b><button type="button" data-d="1">+</button></div></div>`).join('')}`).join('')}</div>`;
}
function bindPicker(root) {
  $$('.part-line', root).forEach(l => $$('button', l).forEach(b => b.onclick = () => { const v = $('b', l); v.textContent = Math.max(0, +v.textContent + +b.dataset.d); }));
}
const readPicker = root => $$('.part-line', root).map(l => ({ partId: l.dataset.pid, qty: +$('b', l).textContent })).filter(p => p.qty > 0);
const partsList = arr => arr?.length ? arr.map(p => `<div>• ${esc(PARTS[p.partId]?.name || p.partId)} <b>×${p.qty}</b> <span class="small muted">(stok ${PARTS[p.partId]?.qty ?? '?'})</span></div>`).join('') : '<span class="muted">—</span>';

async function vTicket(id) {
  const t = TICKETS.find(x => x.id === id); if (!t) { view().innerHTML = '<div class="card">Bilet bulunamadı.</div>'; return; }
  const media = (await Promise.all((t.media || []).map(m => get('media', m)))).filter(Boolean);
  const r = role(); const R = ROLES[r];
  let actions = '';
  if (t.status === 'acik' && R.canAssign) actions = `<button class="btn primary block" data-a="assign">👷 Ata, öncelik ve parça belirle</button>`;
  if (t.status === 'atandi' && R.canAssign) actions += `<button class="btn block" data-a="assign">✎ Atamayı düzenle</button>`;
  if (t.status === 'atandi' && R.canWork) actions += `<button class="btn ok block" data-a="done" style="margin-top:10px">✔ İşi tamamladım</button>`;
  if ((t.status === 'tamamlandi' || t.status === 'karaya') && R.canClose) actions = `<button class="btn ok block" data-a="close">✔ Onayla ve kapat (stoktan düş)</button>
    ${t.status === 'tamamlandi' ? `<button class="btn block" data-a="shore" style="margin-top:10px">🏢 Karaya ilet (Superintendent)</button>` : ''}
    <button class="btn ghost block" data-a="back" style="margin-top:10px">↩ Geri gönder (yeniden çalışma)</button>`;
  if (!actions && t.status !== 'kapandi') {
    const who = { acik: '2. Çarkçı (atama)', atandi: 'atanan personel (işi tamamlama)', tamamlandi: 'Çarkçıbaşı (onay)', karaya: 'Çarkçıbaşı (kapatma)' }[t.status];
    actions = `<div class="info small">Sıradaki adım: <b>${who}</b>. Rolü üstten değiştirerek akışı ilerletebilirsin.</div>`;
  }
  const sugg = suggest(t.equipmentId, t.title + ' ' + t.description, t.id);
  view().innerHTML = `
    <div class="tk-head"><span class="mono muted">${t.id} · v${t.version}</span>${statusBadge(t.status)}</div>
    <h1>${esc(t.title)}</h1>
    <div class="tk-meta">${prioBadge(t.priority)}<span class="badge b-none">${t.type === 'bakim' ? 'Bakım' : 'Arıza'}</span></div>
    <div class="card" style="margin-top:12px">
      <div class="small muted">Ekipman</div><a href="#/ekipman/${t.equipmentId}"><b>${esc(eqLabel(t.equipmentId))}</b></a> <span class="mono small muted">${t.equipmentId}</span>
      <div class="small muted" style="margin-top:8px">Durum</div><div>${STATUS[t.status]}</div>
      <div class="small muted" style="margin-top:8px">Açan / zaman</div><div>${esc(t.createdBy)} · ${fmt(t.detectedAt || t.createdAt)}</div>
      ${t.assignedTo ? `<div class="small muted" style="margin-top:8px">Atanan</div><div>👷 ${esc(t.assignedTo)}</div>` : ''}
      <div class="small muted" style="margin-top:8px">Açıklama</div><div>${esc(t.description) || '<span class="muted">—</span>'}</div>
      ${media.length ? `<div class="media-row">${media.map(m => m.kind === 'photo' ? `<img src="${objUrl(m.blob)}" alt="foto">` : `<audio controls src="${objUrl(m.blob)}"></audio>`).join('')}</div>` : ''}
    </div>
    <div class="card"><div class="small muted">Gerekli yedek parça (2. Çarkçı)</div>${partsList(t.partsNeeded)}
      ${t.partsUsed?.length ? `<div class="small muted" style="margin-top:8px">Kullanılan parça</div>${partsList(t.partsUsed)}` : ''}
      ${t.resolution ? `<div class="small muted" style="margin-top:8px">Yapılan iş / çözüm</div><div>${esc(t.resolution)}</div>` : ''}</div>
    <div id="actions">${actions}</div>
    ${t.status !== 'kapandi' ? `<div class="card ai" style="margin-top:14px">${suggestionHtml(sugg)}</div>` : ''}
    <h2>Geçmiş</h2>
    <ul class="timeline">${t.history.slice().reverse().map(h => `<li><b>${esc(h.action)}</b>${h.note ? ' – ' + esc(h.note) : ''}<span class="small muted">${esc(h.who)} · ${fmt(h.ts)}</span></li>`).join('')}</ul>`;
  $$('[data-a]', view()).forEach(b => b.onclick = () => ACTIONS[b.dataset.a](t));
}

const crewOpts = sel => [CREW.yagci, CREW.c4, CREW.c3, CREW.c2].map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}</option>`).join('');
const ACTIONS = {
  assign(t) {
    let prio = t.priority || '';
    openModal(`<h1>Atama – ${t.id}</h1>
      <label class="f">Öncelik</label>
      <div class="seg" id="prSeg">${Object.entries(PRIO).map(([k, v]) => `<button class="${k} ${prio === k ? 'on' : ''}" data-p="${k}">${v}</button>`).join('')}</div>
      <label class="f">Atanan personel</label><select id="asg">${crewOpts(t.assignedTo || CREW.c3)}</select>
      <label class="f">Gerekli yedek parçalar</label>${partsPicker(t.partsNeeded || [])}
      <div class="row" style="margin-top:16px"><button class="btn" id="mCancel">Vazgeç</button><button class="btn primary" id="mOk">Kaydet</button></div>`);
    $$('#prSeg button').forEach(b => b.onclick = () => { prio = b.dataset.p; $$('#prSeg button').forEach(x => x.classList.toggle('on', x === b)); });
    bindPicker($('#modalCard')); $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async () => {
      if (!prio) { toast('Öncelik seçin'); return; }
      await updateTicket(t, { status: 'atandi', priority: prio, assignedTo: $('#asg').value, partsNeeded: readPicker($('#pp')) }, 'Atandı – ' + PRIO[prio], $('#asg').value);
      closeModal(); toast('Atandı'); route();
    };
  },
  done(t) {
    openModal(`<h1>İş tamamlandı – ${t.id}</h1>
      <label class="f">Yapılan iş / çözüm</label><textarea id="res" placeholder="Ne yapıldı? Test sonucu?">${esc(t.resolution)}</textarea>
      <label class="f">Kullanılan parçalar (onayda stoktan düşülür)</label>${partsPicker(t.partsUsed?.length ? t.partsUsed : t.partsNeeded || [])}
      <div class="row" style="margin-top:16px"><button class="btn" id="mCancel">Vazgeç</button><button class="btn ok" id="mOk">Tamamlandı</button></div>`);
    bindPicker($('#modalCard')); $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async () => {
      const res = $('#res').value.trim(); if (!res) { toast('Yapılan işi yazın'); return; }
      await updateTicket(t, { status: 'tamamlandi', resolution: res, partsUsed: readPicker($('#pp')) }, 'İş tamamlandı');
      closeModal(); toast('Çarkçıbaşı onayına gönderildi'); route();
    };
  },
  close(t) {
    openModal(`<h1>Onayla ve kapat – ${t.id}</h1>
      <div class="small muted">Seçilen parçalar gemi ambar stoğundan düşülecek.</div>
      ${partsPicker(t.partsUsed?.length ? t.partsUsed : t.partsNeeded || [])}
      <label class="f">Not (isteğe bağlı)</label><input id="cn" placeholder="Denetlendi, uygun.">
      <div id="stockWarn"></div>
      <div class="row" style="margin-top:16px"><button class="btn" id="mCancel">Vazgeç</button><button class="btn ok" id="mOk">Onayla & kapat</button></div>`);
    bindPicker($('#modalCard')); $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async () => {
      const used = readPicker($('#pp'));
      const short = used.filter(u => (PARTS[u.partId]?.qty ?? 0) < u.qty);
      if (short.length) { $('#stockWarn').innerHTML = `<div class="warn">Stok yetersiz: ${short.map(s => esc(PARTS[s.partId].name) + ' (stok ' + PARTS[s.partId].qty + ')').join(', ')}</div>`; return; }
      const extra = [];
      used.forEach(u => { const p = { ...PARTS[u.partId] }; const before = p.qty; p.qty -= u.qty; p.updatedAt = Date.now(); extra.push(['parts', p], outboxEntry('part', p.id, 'update', { qty: p.qty, delta: -u.qty, before, reason: 'Bilet ' + t.id })); });
      await updateTicket(t, { status: 'kapandi', partsUsed: used, closedAt: Date.now() }, 'Onaylandı ve kapatıldı', $('#cn').value.trim() || (used.length ? 'Stoktan düşüldü: ' + used.map(u => u.partId + '×' + u.qty).join(', ') : ''), extra);
      closeModal(); toast('Kapatıldı, stok güncellendi'); route();
    };
  },
  shore(t) {
    openModal(`<h1>Karaya ilet – ${t.id}</h1><div class="small muted">Superintendent'e iletilecek not (senkronizasyonda gemi sunucusu → kara paneli).</div>
      <textarea id="sn" placeholder="örn. Yedek parça talebi, servis mühendisi ihtiyacı…"></textarea>
      <div class="row" style="margin-top:16px"><button class="btn" id="mCancel">Vazgeç</button><button class="btn primary" id="mOk">Karaya ilet</button></div>`);
    $('#mCancel').onclick = closeModal;
    $('#mOk').onclick = async () => { await updateTicket(t, { status: 'karaya' }, 'Karaya iletildi (Superintendent)', $('#sn').value.trim()); closeModal(); toast('Karaya iletilmek üzere kuyruğa alındı'); route(); };
  },
  async back(t) {
    const note = prompt('Geri gönderme nedeni:', 'Eksik iş / tekrar kontrol'); if (note === null) return;
    await updateTicket(t, { status: 'atandi' }, 'Geri gönderildi', note); toast('Geri gönderildi'); route();
  }
};

async function vStock(params) {
  const cat = params.get('c') || 'Tümü', q = (params.get('q') || '').toLocaleLowerCase('tr');
  const CO = ['Filtre', 'O-ring / Conta', 'Valf', 'Rulman', 'Salmastra', 'Nozul'];
  const all = Object.values(PARTS).sort((a, b) => (CO.indexOf(a.cat) - CO.indexOf(b.cat)) || a.id.localeCompare(b.id)); const cats = ['Tümü', 'Düşük stok', ...new Set(all.map(p => p.cat))];
  const list = all.filter(p => (cat === 'Tümü' || p.cat === cat || (cat === 'Düşük stok' && p.qty <= p.min)) && (!q || (p.name + p.id).toLocaleLowerCase('tr').includes(q)));
  const low = all.filter(p => p.qty <= p.min).length;
  view().innerHTML = `<h1>Yedek Parça Stoğu</h1>
    ${low ? `<div class="warn small">⚠ ${low} kalem minimum stok seviyesinde veya altında.</div>` : ''}
    <input id="stSearch" type="search" placeholder="Parça ara…" value="${esc(params.get('q') || '')}">
    <div class="tabs" style="margin-top:10px">${cats.map(c => `<button class="tab ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${list.map(p => `<div class="card"><div class="row"><div style="flex:3"><b>${esc(p.name)}</b><div class="small muted mono">${p.id} · ${esc(p.cat)} · ${esc(p.loc)}</div><div class="small muted">Min: ${p.min} ${p.unit}</div></div>
      <div class="stock-q ${p.qty <= p.min ? 'low' : ''}" style="flex:none">${p.qty}<div class="small muted" style="font-weight:400">${p.unit}</div></div></div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-adj="${p.id}" data-d="-1">− Çıkış</button><button class="btn sm" data-adj="${p.id}" data-d="1">＋ Giriş</button></div></div>`).join('') || '<div class="card muted">Parça bulunamadı.</div>'}`;
  $$('.tab', view()).forEach(b => b.onclick = () => location.hash = '#/stok?c=' + encodeURIComponent(b.dataset.c) + '&q=' + encodeURIComponent($('#stSearch').value));
  $('#stSearch').onchange = () => location.hash = '#/stok?c=' + encodeURIComponent(cat) + '&q=' + encodeURIComponent($('#stSearch').value);
  $$('[data-adj]', view()).forEach(b => b.onclick = async () => {
    const p = { ...PARTS[b.dataset.adj] }; const d = +b.dataset.d; if (p.qty + d < 0) return;
    const before = p.qty; p.qty += d; p.updatedAt = Date.now();
    await write([['parts', p], outboxEntry('part', p.id, 'update', { qty: p.qty, delta: d, before, reason: 'Manuel stok düzeltme' })]);
    await refreshData(); vStock(params);
  });
}

async function vSync() {
  const box = await getAll('outbox'); const pend = box.filter(o => !o.synced); const logs = (await getAll('syncLog')).reverse().slice(0, 5);
  const on = isOnline();
  view().innerHTML = `<h1>Senkronizasyon</h1>
    <div class="card"><div class="row"><div><span class="dot ${on ? 'on' : 'off'}"></span> <b>${on ? 'Gemi ağına bağlı' : 'Çevrimdışı'}</b><div class="small muted">Cihaz: ${deviceId} · Gemi: ${SHIP_ID}</div></div>
      <div style="flex:none;text-align:right"><div class="stock-q" style="color:var(--accent)">${pend.length}</div><div class="small muted">bekleyen</div></div></div>
      <button class="btn primary block" id="syncBtn" style="margin-top:12px" ${on && pend.length ? '' : 'disabled'}>⇅ Senkronize et</button>
      ${!on ? '<div class="small muted" style="margin-top:6px">Gemi Wi-Fi\'sine bağlanınca senkronize edebilirsiniz. Tüm işlemler cihazda güvende.</div>' : ''}
      <label class="row small" style="margin-top:12px;gap:8px"><input type="checkbox" id="fo" style="width:28px;min-height:28px;flex:none" ${localStorage.getItem('forceOffline') === '1' ? 'checked' : ''}> <span>Çevrimdışı modu simüle et (makine dairesi testi)</span></label>
    </div>
    <div class="info small">Simülasyon: "Senkronize et", bekleyen değişiklikleri JSON delta paketi olarak MCR gemi sunucusuna gönderiyormuş gibi yapar, kayıtları senkronize olarak işaretler ve paketi aşağıya kaydeder. Gerçek sunucu yoktur.</div>
    <h2>Bekleyen değişiklikler (${pend.length})</h2>
    ${pend.length ? pend.slice().reverse().map(o => `<div class="card small"><b>${o.entity}</b> · ${o.op} · <span class="mono">${esc(o.entityId)}</span><div class="muted">${fmt(o.ts)} · ${esc(o.user)}${o.changes?.action ? ' · ' + esc(o.changes.action) : ''}</div></div>`).join('') : '<div class="card muted small">Bekleyen değişiklik yok ✓</div>'}
    <h2>Son senkronizasyon paketleri</h2>
    ${logs.length ? logs.map(l => `<details class="card"><summary><b>${fmt(l.at)}</b> · ${l.count} değişiklik · ${kb(l.bytes)}</summary><pre class="json">${esc(JSON.stringify(l.payload, null, 2))}</pre></details>`).join('') : '<div class="card muted small">Henüz senkronizasyon yapılmadı.</div>'}
    <h2>Demo</h2><button class="btn danger block" id="resetBtn">Demo verilerini sıfırla</button>`;
  $('#fo').onchange = e => { localStorage.setItem('forceOffline', e.target.checked ? '1' : '0'); updatePill(); vSync(); };
  $('#syncBtn').onclick = doSync;
  $('#resetBtn').onclick = async () => { if (!confirm('Tüm yerel veriler silinip örnek verilerle yeniden başlatılsın mı?')) return; db.close(); await rq(indexedDB.deleteDatabase('md-bilet')); location.hash = '#/'; location.reload(); };
}
async function doSync() {
  if (!isOnline()) { toast('Çevrimdışı – senkronizasyon yapılamaz'); return; }
  const pend = (await getAll('outbox')).filter(o => !o.synced); if (!pend.length) { toast('Bekleyen değişiklik yok'); return; }
  const btn = $('#syncBtn'); if (btn) { btn.disabled = true; btn.textContent = '⇅ Gönderiliyor…'; }
  const payload = { shipId: SHIP_ID, deviceId, sentAt: new Date().toISOString(), target: 'MCR gemi sunucusu (simülasyon)',
    changes: pend.map(({ synced, ...o }) => ({ ...o, ts: new Date(o.ts).toISOString() })) };
  const json = JSON.stringify(payload);
  await new Promise(r => setTimeout(r, 900)); // ağ gecikmesi simülasyonu
  console.log('[SYNC] JSON delta →', payload);
  const at = Date.now();
  await write([...pend.map(o => ['outbox', { ...o, synced: 1, syncedAt: at }]), ['syncLog', { at, count: pend.length, bytes: new Blob([json]).size, payload }]]);
  await refreshData(); toast(`✔ ${pend.length} değişiklik senkronize edildi`); if (location.hash.startsWith('#/senkron')) vSync();
}

// ---------- Kabuk ----------
async function updatePill() {
  const n = await pendingCount(); const on = isOnline();
  $('#syncPill').innerHTML = `<span class="dot ${on ? 'on' : 'off'}"></span>${on ? 'Çevrimiçi' : 'Çevrimdışı'} · ${n ? n + ' bekliyor' : '✓ senkron'}`;
}
async function refreshData() {
  await loadAll();
  PENDING_IDS = new Set((await getAll('outbox')).filter(o => !o.synced && o.entity === 'ticket').map(o => o.entityId));
  await updatePill();
}
function setRole(r) { localStorage.setItem('role', r); $('#roleSel').value = r; toast('Rol: ' + ROLES[r].label); route(); }
async function route() {
  if (cleanup) { const c = cleanup; cleanup = null; await c(); }
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  const h = location.hash.slice(1) || '/'; const [path, qs] = h.split('?'); const params = new URLSearchParams(qs || '');
  const seg = path.split('/').filter(Boolean);
  const nav = { '': 'biletler', bilet: 'biletler', yeni: 'biletler', ekipman: 'ekipman', 'qr-etiket': 'ekipman', tara: 'tara', stok: 'stok', senkron: 'senkron' }[seg[0] || ''];
  $$('.bottomnav a').forEach(a => a.classList.toggle('on', a.dataset.nav === nav));
  window.scrollTo(0, 0);
  if (!seg.length) return vTickets(params);
  if (seg[0] === 'ekipman') return seg[1] ? vEquipment(decodeURIComponent(seg[1]), params) : vTree(params);
  if (seg[0] === 'bilet') return vTicket(seg[1]);
  if (seg[0] === 'yeni') return vNew(params);
  if (seg[0] === 'tara') return vScan();
  if (seg[0] === 'stok') return vStock(params);
  if (seg[0] === 'senkron') return vSync();
  if (seg[0] === 'qr-etiket') return vLabels(params);
  vTickets(params);
}

(async function init() {
  const rs = $('#roleSel');
  rs.innerHTML = Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  rs.value = role(); rs.onchange = () => setRole(rs.value);
  db = await openDB(); await seedIfNeeded(); await refreshData();
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { updatePill(); toast('Gemi ağına bağlandı – senkronize edebilirsiniz'); });
  window.addEventListener('offline', () => { updatePill(); toast('Çevrimdışı – kayıtlar cihazda tutuluyor'); });
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => { if (!navigator.serviceWorker.controller) reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'activated') toast('✔ Uygulama çevrimdışı kullanıma hazır'); }); }); }).catch(() => { });
  }
})();
