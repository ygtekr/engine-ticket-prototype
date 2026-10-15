// Örnek veri (prototip). SFI kodları not dosyasındaki örneğe göre (701 Main Engine, 711 Auxiliary Engines);
// diğer grup kodları gösterim amaçlıdır, gerçek gemi SFI listesiyle değiştirilmelidir.
window.SEED = (function () {
  const H = 3600e3, D = 24 * H, now = Date.now();
  const equipment = [
    { id: 'EQ-701', sfi: '701', name: 'Ana Makine (Main Engine)', parent: null, maker: 'MAN B&W 6S50MC-C', loc: 'Makine dairesi – alt plaka' },
    { id: 'EQ-701.01', sfi: '701.01', name: 'Silindir Kapakları & Egzoz Valfleri', parent: 'EQ-701', maker: 'MAN B&W', loc: 'Üst plaka' },
    { id: 'EQ-701.02', sfi: '701.02', name: 'Yakıt Enjeksiyon Sistemi (Fuel Injection)', parent: 'EQ-701', maker: 'MAN B&W', loc: 'Orta plaka' },
    { id: 'EQ-701.03', sfi: '701.03', name: 'Turboşarj (Turbocharger)', parent: 'EQ-701', maker: 'MAN TCA55', loc: 'Üst plaka – kıç' },
    { id: 'EQ-701.04', sfi: '701.04', name: 'Süpürme Havası Soğutucusu (Scavenge Air Cooler)', parent: 'EQ-701', maker: 'Kelvion', loc: 'Orta plaka – iskele' },

    { id: 'EQ-711', sfi: '711', name: 'Yardımcı Makineler / Jeneratörler (Auxiliary Engines)', parent: null, maker: '', loc: 'Jeneratör platformu' },
    { id: 'EQ-711.01', sfi: '711.01', name: 'DG1 – Dizel Jeneratör 1', parent: 'EQ-711', maker: 'Yanmar 6EY18ALW / 800 kW', loc: 'Jeneratör platformu – iskele' },
    { id: 'EQ-711.02', sfi: '711.02', name: 'DG2 – Dizel Jeneratör 2', parent: 'EQ-711', maker: 'Yanmar 6EY18ALW / 800 kW', loc: 'Jeneratör platformu – orta' },
    { id: 'EQ-711.03', sfi: '711.03', name: 'DG3 – Dizel Jeneratör 3', parent: 'EQ-711', maker: 'Yanmar 6EY18ALW / 800 kW', loc: 'Jeneratör platformu – sancak' },

    { id: 'EQ-731', sfi: '731', name: 'Kazanlar (Boilers)', parent: null, maker: '', loc: 'Kazan dairesi' },
    { id: 'EQ-731.01', sfi: '731.01', name: 'Yardımcı Kazan (Aux. Boiler)', parent: 'EQ-731', maker: 'Alfa Laval Aalborg OM', loc: 'Kazan platformu' },
    { id: 'EQ-731.02', sfi: '731.02', name: 'Egzoz Gazı Ekonomizeri (Exh. Gas Economizer)', parent: 'EQ-731', maker: 'Alfa Laval Aalborg XS', loc: 'Baca – A güverte' },

    { id: 'EQ-741', sfi: '741', name: 'Seperatörler (Separators)', parent: null, maker: '', loc: 'Seperatör odası' },
    { id: 'EQ-741.01', sfi: '741.01', name: 'HFO Seperatörü No.1 (HFO Purifier)', parent: 'EQ-741', maker: 'Alfa Laval S831', loc: 'Seperatör odası' },
    { id: 'EQ-741.02', sfi: '741.02', name: 'Ana Makine LO Seperatörü (LO Purifier)', parent: 'EQ-741', maker: 'Alfa Laval S821', loc: 'Seperatör odası' },
    { id: 'EQ-741.03', sfi: '741.03', name: 'Sintine Seperatörü (OWS 15 ppm)', parent: 'EQ-741', maker: 'RWO SKIT/S-DEB 2.5', loc: 'Alt plaka – kıç' },

    { id: 'EQ-751', sfi: '751', name: 'Pompalar (Pumps)', parent: null, maker: '', loc: '' },
    { id: 'EQ-751.01', sfi: '751.01', name: 'Ana Makine Yağlama Yağı Pompası No.1 (ME LO Pump)', parent: 'EQ-751', maker: 'Shinko SVS', loc: 'Alt plaka – iskele' },
    { id: 'EQ-751.02', sfi: '751.02', name: 'Deniz Suyu Soğutma Pompası No.1 (SW Cooling Pump)', parent: 'EQ-751', maker: 'Shinko RVP', loc: 'Alt plaka – sancak' },
    { id: 'EQ-751.03', sfi: '751.03', name: 'Yakıt Transfer Pompası (FO Transfer Pump)', parent: 'EQ-751', maker: 'IMO ACE', loc: 'Alt plaka – orta' },
    { id: 'EQ-751.04', sfi: '751.04', name: 'Sintine Pompası (Bilge Pump)', parent: 'EQ-751', maker: 'Taiko', loc: 'Alt plaka – kıç' },

    { id: 'EQ-761', sfi: '761', name: 'Vanalar (Valves)', parent: null, maker: '', loc: '' },
    { id: 'EQ-761.01', sfi: '761.01', name: 'Deniz Suyu Emme Valfi – Alçak Sea Chest', parent: 'EQ-761', maker: 'DN300 kelebek valf', loc: 'Alt plaka – sancak' },
    { id: 'EQ-761.02', sfi: '761.02', name: 'Hızlı Kapama Valfi – HFO Servis Tankı (Quick Closing)', parent: 'EQ-761', maker: 'DN50 pnömatik', loc: 'Seperatör odası' },
    { id: 'EQ-761.03', sfi: '761.03', name: 'Bordadan Atış Valfi – OWS (Overboard)', parent: 'EQ-761', maker: 'DN40 globe', loc: 'Alt plaka – kıç' }
  ];

  const parts = [
    { id: 'P-FLT-001', cat: 'Filtre', name: 'Yağlama yağı filtre elemanı – DG', qty: 12, min: 4, unit: 'adet', loc: 'Ambar A-1' },
    { id: 'P-FLT-002', cat: 'Filtre', name: 'Yakıt filtre elemanı – DG', qty: 10, min: 4, unit: 'adet', loc: 'Ambar A-1' },
    { id: 'P-FLT-003', cat: 'Filtre', name: 'ME LO otomatik filtre kartuşu', qty: 3, min: 2, unit: 'adet', loc: 'Ambar A-2' },
    { id: 'P-FLT-004', cat: 'Filtre', name: 'Turboşarj hava filtresi (silencer mat)', qty: 2, min: 1, unit: 'adet', loc: 'Ambar A-2' },
    { id: 'P-OR-001', cat: 'O-ring / Conta', name: 'O-ring seti – yakıt enjektörü DG', qty: 6, min: 2, unit: 'set', loc: 'Ambar B-1' },
    { id: 'P-OR-002', cat: 'O-ring / Conta', name: 'O-ring Ø120×5 NBR', qty: 25, min: 10, unit: 'adet', loc: 'Ambar B-1' },
    { id: 'P-OR-003', cat: 'O-ring / Conta', name: 'Seperatör bowl conta seti (S831)', qty: 2, min: 2, unit: 'set', loc: 'Ambar B-2' },
    { id: 'P-OR-004', cat: 'O-ring / Conta', name: 'Silindir kapağı contası – ME', qty: 3, min: 1, unit: 'adet', loc: 'Ambar B-3' },
    { id: 'P-VLV-001', cat: 'Valf', name: 'Egzoz valfi komple – ME', qty: 1, min: 1, unit: 'adet', loc: 'Ambar C-1' },
    { id: 'P-VLV-002', cat: 'Valf', name: 'Emniyet valfi DN25', qty: 2, min: 1, unit: 'adet', loc: 'Ambar C-1' },
    { id: 'P-VLV-003', cat: 'Valf', name: 'Solenoid valf – çalışma suyu (seperatör)', qty: 1, min: 1, unit: 'adet', loc: 'Ambar C-2' },
    { id: 'P-BRG-001', cat: 'Rulman', name: 'Rulman 6312-2RS (pompa)', qty: 4, min: 2, unit: 'adet', loc: 'Ambar D-1' },
    { id: 'P-BRG-002', cat: 'Rulman', name: 'Rulman 6208-ZZ', qty: 6, min: 2, unit: 'adet', loc: 'Ambar D-1' },
    { id: 'P-BRG-003', cat: 'Rulman', name: 'Ana yatak kusineti – DG', qty: 2, min: 2, unit: 'çift', loc: 'Ambar D-2' },
    { id: 'P-SEL-001', cat: 'Salmastra', name: 'Mekanik salmastra – ME LO pompası', qty: 1, min: 1, unit: 'adet', loc: 'Ambar D-3' },
    { id: 'P-SEL-002', cat: 'Salmastra', name: 'Mekanik salmastra – SW pompası', qty: 2, min: 1, unit: 'adet', loc: 'Ambar D-3' },
    { id: 'P-NZL-001', cat: 'Nozul', name: 'Enjektör nozulu – DG', qty: 8, min: 3, unit: 'adet', loc: 'Ambar B-3' },
    { id: 'P-NZL-002', cat: 'Nozul', name: 'Brülör nozulu – yardımcı kazan', qty: 3, min: 1, unit: 'adet', loc: 'Ambar C-3' }
  ];

  const R = {
    yagci: 'Mehmet K. (Yağcı)', c3: 'Ali Y. (3. Çarkçı)', c4: 'Emre T. (4. Çarkçı)',
    c2: 'Hasan D. (2. Çarkçı)', chief: 'Çarkçıbaşı (Chief Eng.)'
  };
  function h(ts, role, who, action, note) { return { ts, role, who, action, note: note || '' }; }
  const t = (o) => Object.assign({ type: 'ariza', priority: null, assignedTo: null, partsNeeded: [], partsUsed: [], resolution: '', media: [], version: 1 }, o);

  const tickets = [
    t({ id: 'TKT-0001', equipmentId: 'EQ-711.02', title: 'Yakıt enjektörü kaçağı – 4 nolu silindir',
      description: 'DG2 4 nolu silindir yakıt enjektörü dönüş hattında yakıt kaçağı var, egzoz sıcaklığı diğer silindirlerden 40°C yüksek.',
      status: 'kapandi', priority: 'acil', assignedTo: R.c3, createdAt: now - 21 * D, createdBy: R.yagci,
      partsNeeded: [{ partId: 'P-NZL-001', qty: 1 }, { partId: 'P-OR-001', qty: 1 }], partsUsed: [{ partId: 'P-NZL-001', qty: 1 }, { partId: 'P-OR-001', qty: 1 }],
      resolution: 'Enjektör söküldü, nozul değiştirildi, O-ring seti yenilendi. Açılma basıncı 320 bar test edildi, egzoz sıcaklıkları dengelendi.',
      history: [h(now - 21 * D, 'yagci', R.yagci, 'Bilet açıldı'), h(now - 21 * D + 1 * H, 'c2', R.c2, 'Atandı – Acil', R.c3), h(now - 20 * D, 'c34', R.c3, 'İş tamamlandı'), h(now - 20 * D + 3 * H, 'chief', R.chief, 'Onaylandı ve kapatıldı')] }),
    t({ id: 'TKT-0002', equipmentId: 'EQ-701.03', title: 'Turboşarj titreşim ve anormal ses',
      description: 'Turboşarjda yüksek devirde titreşim ve ıslık sesi. Süpürme havası basıncı düşük.',
      status: 'kapandi', priority: 'rutin', assignedTo: R.c2, createdAt: now - 35 * D, createdBy: R.c4,
      partsUsed: [{ partId: 'P-FLT-004', qty: 1 }],
      resolution: 'Hava filtresi (silencer mat) tıkalıydı, değiştirildi. Kompresör tarafı su ile yıkandı; titreşim ve süpürme havası basıncı normale döndü.',
      history: [h(now - 35 * D, 'c34', R.c4, 'Bilet açıldı'), h(now - 35 * D + 2 * H, 'c2', R.c2, 'Atandı – Rutin'), h(now - 34 * D, 'chief', R.chief, 'Onaylandı ve kapatıldı')] }),
    t({ id: 'TKT-0003', equipmentId: 'EQ-741.01', title: 'Seperatör çamur atma alarmı – su contası kaybı',
      description: 'HFO seperatörü sürekli çamur atma (sludge discharge) yapıyor, su contası tutmuyor, yakıt kaçağı alarmı.',
      status: 'kapandi', priority: 'acil', assignedTo: R.c3, createdAt: now - 14 * D, createdBy: R.yagci,
      partsUsed: [{ partId: 'P-OR-003', qty: 1 }, { partId: 'P-VLV-003', qty: 1 }],
      resolution: 'Bowl açıldı, ana conta ve O-ringler değiştirildi. Çalışma suyu solenoid valfi arızalıydı, yenisi takıldı. 4 saat test edildi, sorun yok.',
      history: [h(now - 14 * D, 'yagci', R.yagci, 'Bilet açıldı'), h(now - 14 * D + 1 * H, 'c2', R.c2, 'Atandı – Acil'), h(now - 13 * D, 'chief', R.chief, 'Onaylandı ve kapatıldı')] }),
    t({ id: 'TKT-0004', equipmentId: 'EQ-711.02', title: 'Jeneratör ana yatak sıcaklığı yüksek',
      description: 'DG2 ana yatak sıcaklık alarmı, yağ basıncı normalin altında. Yağ filtresi diferansiyel basıncı yüksek.',
      status: 'kapandi', priority: 'acil', assignedTo: R.c2, createdAt: now - 60 * D, createdBy: R.c3,
      partsUsed: [{ partId: 'P-FLT-001', qty: 2 }],
      resolution: 'Yağ filtreleri değiştirildi, yağ numunesi alındı (analiz normal). Yatak sıcaklıkları kontrol edildi, alarm tekrarlamadı.',
      history: [h(now - 60 * D, 'c34', R.c3, 'Bilet açıldı'), h(now - 59 * D, 'chief', R.chief, 'Onaylandı ve kapatıldı')] }),
    t({ id: 'TKT-0005', equipmentId: 'EQ-751.01', title: 'Pompa mekanik salmastra kaçağı',
      description: 'ME LO pompası No.1 mekanik salmastradan damla damla yağ kaçağı, pompa rulmanından ses geliyor.',
      status: 'tamamlandi', priority: 'rutin', assignedTo: R.c4, createdAt: now - 3 * D, createdBy: R.yagci,
      partsNeeded: [{ partId: 'P-SEL-001', qty: 1 }, { partId: 'P-BRG-001', qty: 2 }], partsUsed: [{ partId: 'P-SEL-001', qty: 1 }, { partId: 'P-BRG-001', qty: 2 }],
      resolution: 'Pompa No.2\'ye geçildi. No.1 söküldü, mekanik salmastra ve iki rulman değiştirildi, hizalama kontrol edildi.',
      history: [h(now - 3 * D, 'yagci', R.yagci, 'Bilet açıldı'), h(now - 3 * D + 2 * H, 'c2', R.c2, 'Atandı – Rutin', R.c4), h(now - 1 * D, 'c34', R.c4, 'İş tamamlandı')] }),
    t({ id: 'TKT-0006', equipmentId: 'EQ-731.01', title: 'Brülör alev sönmesi (flame failure) alarmı',
      description: 'Yardımcı kazan brülöründe tekrarlayan flame failure alarmı, ateşleme sonrası alev 5-10 sn içinde sönüyor.',
      status: 'atandi', priority: 'acil', assignedTo: R.c3, createdAt: now - 20 * H, createdBy: R.c4,
      partsNeeded: [{ partId: 'P-NZL-002', qty: 1 }],
      history: [h(now - 20 * H, 'c34', R.c4, 'Bilet açıldı'), h(now - 19 * H, 'c2', R.c2, 'Atandı – Acil', R.c3)] }),
    t({ id: 'TKT-0007', equipmentId: 'EQ-751.02', title: 'Pompa gövdesinde çatlak – deniz suyu sızıntısı',
      description: 'SW soğutma pompası No.1 gövdesinde kıl çatlak, deniz suyu sızıyor. Gemide yedek gövde yok.',
      status: 'karaya', priority: 'acil', assignedTo: R.c2, createdAt: now - 6 * D, createdBy: R.c3,
      partsNeeded: [{ partId: 'P-SEL-002', qty: 1 }],
      resolution: 'Geçici çözüm: pompa izole edildi, No.2 pompa devrede. Çatlağa geçici epoksi uygulandı.',
      history: [h(now - 6 * D, 'c34', R.c3, 'Bilet açıldı'), h(now - 6 * D + 1 * H, 'c2', R.c2, 'Atandı – Acil'), h(now - 5 * D, 'c34', R.c2, 'İş tamamlandı'), h(now - 5 * D + 2 * H, 'chief', R.chief, 'Karaya iletildi (Superintendent)', 'Yeni pompa gövdesi talep edildi, sonraki limanda teslim.')] }),
    t({ id: 'TKT-0008', equipmentId: 'EQ-761.02', title: 'Hızlı kapama valfi uzaktan test başarısız',
      description: 'HFO servis tankı hızlı kapama valfi uzaktan kumanda (yangın istasyonu) testinde tam kapanmadı. PSC denetiminde eksiklik olarak yazılabilir.',
      status: 'atandi', priority: 'psc', assignedTo: R.c2, createdAt: now - 2 * D, createdBy: R.c3,
      partsNeeded: [{ partId: 'P-OR-002', qty: 2 }],
      history: [h(now - 2 * D, 'c34', R.c3, 'Bilet açıldı'), h(now - 2 * D + 1 * H, 'c2', R.c2, 'Atandı – PSC Eksikliği', R.c2)] }),
    t({ id: 'TKT-0009', equipmentId: 'EQ-711.01', title: 'Soğutma suyu sıcaklığı yüksek',
      description: 'DG1 ceket soğutma suyu çıkış sıcaklığı 88°C, alarm sınırına yakın. Termostatik valf kontrol edilmeli.',
      status: 'acik', createdAt: now - 2 * H, createdBy: R.yagci,
      history: [h(now - 2 * H, 'yagci', R.yagci, 'Bilet açıldı')] }),
    t({ id: 'TKT-0010', equipmentId: 'EQ-761.01', title: 'Deniz suyu emme valfi tam kapanmıyor',
      type: 'bakim', description: 'Alçak sea chest emme valfi kapatıldığında son 10° kapanmıyor, mil sıkı. Havuz öncesi bakım planına alınmalı.',
      status: 'acik', createdAt: now - 5 * H, createdBy: R.c4,
      history: [h(now - 5 * H, 'c34', R.c4, 'Bilet açıldı')] })
  ];
  tickets.forEach(x => { x.updatedAt = x.history[x.history.length - 1].ts; });
  return { equipment, parts, tickets, crew: R };
})();
