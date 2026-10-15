const { chromium } = require('playwright-core');
const SS = '/workspace/screenshots/';
const BASE = 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', permissions: ['microphone', 'camera'] });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const shot = async (n, full = false) => { await p.waitForTimeout(400); await p.evaluate(() => document.getElementById('toast').hidden = true); await p.screenshot({ path: SS + n + '.png', fullPage: full }); console.log('shot', n); };
  await p.goto(BASE); await p.waitForSelector('.card');
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => console.log('no SW controller yet'));
  await p.reload(); await p.waitForSelector('.card');
  // QR image for scan test (screenshot of a label)
  await p.goto(BASE + '#/qr-etiket?id=EQ-741.01'); await p.waitForSelector('.label');
  await p.locator('.label').screenshot({ path: '/tmp/qr-741.png' });
  // 1 list (yağcı)
  await p.goto(BASE + '#/'); await p.waitForSelector('.tab'); await p.click('[data-f="tumu"]'); await shot('01-biletler-tumu-yagci');
  // 2 tree
  await p.goto(BASE + '#/ekipman'); await p.waitForSelector('.tree-group'); await shot('02-ekipman-agaci');
  await shot('02b-ekipman-agaci-tam', true);
  // 3 equipment detail with QR
  await p.goto(BASE + '#/ekipman/EQ-711.02'); await p.waitForSelector('.qrbox svg'); await shot('03-ekipman-detay-qr');
  // 4 scan via image file
  await p.goto(BASE + '#/tara'); await p.waitForSelector('#qrFile', { state: 'attached' });
  await shot('04-qr-tara');
  await p.setInputFiles('#qrFile', '/tmp/qr-741.png');
  await p.waitForFunction(() => location.hash.includes('EQ-741.01'), null, { timeout: 10000 }).then(() => console.log('QR scan from image OK')).catch(() => console.log('QR scan FAILED', p.url()));
  await shot('05-qr-okundu-ekipman');
  // 6 new ticket with AI suggestions, photo, audio
  await p.goto(BASE + '#/yeni?eq=EQ-711.02'); await p.waitForSelector('#nTitle');
  await p.fill('#nTitle', 'Enjektör yakıt kaçağı – 2 nolu silindir');
  await p.fill('#nDesc', 'DG2 2 nolu silindir enjektör dönüş hattında yakıt kaçağı, egzoz sıcaklığı yüksek.');
  await p.waitForTimeout(500);
  await p.setInputFiles('#nPhoto', '/workspace/screenshots/03-ekipman-detay-qr.png');
  await p.waitForSelector('#photoRow img');
  await p.click('#recBtn'); await p.waitForTimeout(2200); await p.click('#recBtn'); await p.waitForSelector('#audioRow audio', { timeout: 5000 }).catch(() => console.log('audio rec failed'));
  await p.evaluate(() => { document.querySelector('#aiBox').scrollIntoView({ block: 'start' }); window.scrollBy(0, -140); }); await shot('06-yeni-bilet-ai-oneri');
  await shot('06b-yeni-bilet-tam', true);
  await p.click('#saveBtn'); await p.waitForFunction(() => location.hash.startsWith('#/bilet/TKT-0011'));
  await p.waitForSelector('h1'); await shot('07-bilet-acildi', true);
  // 8 role: 2. Çarkçı list & assign
  await p.selectOption('#roleSel', 'c2'); await p.goto(BASE + '#/'); await p.waitForSelector('.tab'); await shot('08-biletler-2carkci');
  await p.goto(BASE + '#/bilet/TKT-0011'); await p.click('[data-a="assign"]'); await p.click('#prSeg [data-p="acil"]');
  await p.click('.part-line[data-pid="P-NZL-001"] [data-d="1"]'); await p.click('.part-line[data-pid="P-OR-001"] [data-d="1"]');
  await p.evaluate(() => document.getElementById('modalCard').scrollTop = 0); await shot('09-atama-modal'); await p.click('#mOk'); await p.waitForTimeout(500);
  // c34 completes
  await p.selectOption('#roleSel', 'c34'); await p.goto(BASE + '#/bilet/TKT-0011'); await p.click('[data-a="done"]');
  await p.fill('#res', 'Nozul ve O-ring seti değiştirildi, 320 bar test OK.'); await p.click('#mOk'); await p.waitForTimeout(500);
  // chief
  await p.selectOption('#roleSel', 'chief'); await p.goto(BASE + '#/'); await p.waitForSelector('.tab'); await shot('10-biletler-carkcibasi');
  const before = await p.evaluate(async () => (await new Promise(r => { const q = indexedDB.open('md-bilet'); q.onsuccess = () => { const g = q.result.transaction('parts').objectStore('parts').get('P-NZL-001'); g.onsuccess = () => r(g.result.qty); }; })));
  await p.goto(BASE + '#/bilet/TKT-0011'); await p.click('[data-a="close"]'); await p.evaluate(() => document.getElementById('modalCard').scrollTop = 0); await shot('11-onayla-kapat-modal'); await p.click('#mOk'); await p.waitForTimeout(600);
  const after = await p.evaluate(async () => (await new Promise(r => { const q = indexedDB.open('md-bilet'); q.onsuccess = () => { const g = q.result.transaction('parts').objectStore('parts').get('P-NZL-001'); g.onsuccess = () => r(g.result.qty); }; })));
  console.log('Stock P-NZL-001 before/after close:', before, after);
  await shot('12-bilet-kapandi', true);
  // stock
  await p.goto(BASE + '#/stok'); await p.waitForSelector('.card'); await shot('13-stok');
  // sync
  await p.goto(BASE + '#/senkron'); await p.waitForSelector('#syncBtn'); await shot('14-senkron-bekleyen');
  await p.click('#syncBtn'); await p.waitForSelector('details.card'); await p.click('details.card summary'); await shot('15-senkron-sonrasi', true);
  // offline reload test
  await ctx.setOffline(true);
  await p.goto(BASE + '#/ekipman'); await p.reload(); await p.waitForSelector('.tree-group', { timeout: 8000 }).then(() => console.log('OFFLINE reload OK')).catch(() => console.log('OFFLINE reload FAILED'));
  await p.goto(BASE + '#/'); await p.waitForSelector('.tab'); await shot('16-cevrimdisi');
  console.log('pill:', await p.textContent('#syncPill'));
  console.log('ERRORS:', JSON.stringify(errs, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
