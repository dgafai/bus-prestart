/* Bus Pre-start app. Plain JS, no framework. */
(function () {
  var CFG = window.PRESTART_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var app = $('#app');
  var S = { boot: null, driver: localStorage.driver || '', bus: null, start: null, answers: {}, step: 0, draftId: null };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function ref() { var d = new Date(); return 'PS-' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); }
  function hm(ts) { var d = new Date(ts); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dt(ts) { return new Date(ts).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }); }
  function buzz() { try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} }

  /* ---------- IndexedDB: kv store for outbox, drafts, cache ---------- */
  var dbp = new Promise(function (res, rej) {
    var r = indexedDB.open('prestart', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
  function idb(mode, fn) { return dbp.then(function (db) { return new Promise(function (res, rej) { var t = db.transaction('kv', mode); var st = t.objectStore('kv'); var out = fn(st); t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); }; t.onerror = function () { rej(t.error); }; }); }); }
  var KV = {
    get: function (k) { return idb('readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return idb('readwrite', function (s) { s.put(v, k); }); },
    del: function (k) { return idb('readwrite', function (s) { s.delete(k); }); },
    keys: function () { return idb('readonly', function (s) { return s.getAllKeys(); }); }
  };

  /* ---------- Back end: POST text/plain (no CORS preflight) ---------- */
  function api(action, data) {
    if (!CFG.API_URL) return window.Mock.handle(action, data);
    if (!navigator.onLine) return Promise.reject(new Error('offline'));
    var ctl = new AbortController(); var to = setTimeout(function () { ctl.abort(); }, 20000);
    return fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: action, data: data || {} }), signal: ctl.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(to); if (j.error) throw new Error(j.error); return j; });
  }

  /* ---------- Outbox: saved first, sent later, id stops duplicates ---------- */
  var flushing = false;
  function flush() {
    if (flushing) return Promise.resolve(); flushing = true;
    return KV.keys().then(function (ks) {
      var out = ks.filter(function (k) { return String(k).indexOf('out:') === 0; });
      return out.reduce(function (p, k) {
        return p.then(function () { return KV.get(k).then(function (job) {
          return api(job.action, { rec: job.rec }).then(function () { return KV.del(k); }).catch(function () {});
        }); });
      }, Promise.resolve());
    }).then(netBadge).finally(function () { flushing = false; });
  }
  function netBadge() {
    return KV.keys().then(function (ks) {
      var n = ks.filter(function (k) { return String(k).indexOf('out:') === 0; }).length;
      var b = $('#net'); if (!b) return n;
      if (n) { b.hidden = false; b.textContent = n + ' waiting to send'; } else if (!navigator.onLine) { b.hidden = false; b.textContent = 'Offline'; } else b.hidden = true;
      return n;
    });
  }
  setInterval(flush, 30000);
  window.addEventListener('online', function () { flush().then(refresh); });
  window.addEventListener('offline', netBadge);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { flush(); refresh(); } });
  window.addEventListener('pageshow', function () { refresh(); });

  /* ---------- Load bus list (cached for offline) ---------- */
  function load() {
    return api('bootstrap').then(function (b) { S.boot = b; KV.set('cache:boot', b); return b; })
      .catch(function () { return KV.get('cache:boot').then(function (b) { if (!b) throw new Error('No signal and nothing saved yet. Open the app once with signal.'); S.boot = b; S.boot.offline = true; return b; }); });
  }
  var lastRefresh = 0;
  function refresh() {
    if (Date.now() - lastRefresh < 1500) return; lastRefresh = Date.now();
    if (S.view === 'home' || S.view === 'drivers' || !S.view) load().then(function () { if (S.view === 'home') home(); }).catch(function () {});
  }

  /* ---------- Missed-item handling (button never disabled) ---------- */
  function showMissed(els, what) {
    $$('.missed').forEach(function (e) { e.classList.remove('missed'); });
    var err = $('#err');
    if (!els.length) { if (err) err.remove(); return true; }
    els.forEach(function (e) { e.classList.add('missed'); });
    if (!err) { err = document.createElement('div'); err.id = 'err'; app.insertBefore(err, app.firstChild); }
    err.textContent = 'You missed ' + els.length + ' ' + (els.length === 1 ? what : what + 's');
    els[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); buzz();
    return false;
  }
  function clearMiss(el) {
    if (!el) return; el.classList.remove('missed');
    var left = $$('.missed').length, err = $('#err');
    if (err) { if (!left) err.remove(); else err.textContent = err.textContent.replace(/\d+/, left); }
  }

  /* ---------- Screens ---------- */
  function setView(v, html, foot) {
    S.view = v; app.innerHTML = html; window.scrollTo(0, 0);
    var f = $('.foot'); if (f) f.remove();
    if (foot) { f = document.createElement('div'); f.className = 'foot'; f.innerHTML = foot; document.body.appendChild(f); }
    if (S.boot) { $('#co').textContent = S.boot.company || 'Bus Pre-start'; document.title = (S.boot.company || 'Bus') + ' Pre-start'; }
  }

  function drivers() {
    var d = (S.boot.drivers || []).slice().sort();
    setView('drivers', '<h2>Who are you?</h2><div class="list">' +
      d.map(function (n) { return '<button class="row drv" data-n="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') +
      '</div><button class="btn ghost" id="addme">I\'m not on the list – add me</button>');
    $$('.drv').forEach(function (b) { b.onclick = function () { S.driver = localStorage.driver = b.dataset.n; route(); }; });
    $('#addme').onclick = function () {
      setView('add', '<h2>Add yourself</h2><div class="card"><label>Your full name<input id="nm" autocomplete="name"></label><label>4-digit crew PIN (ask the depot)<input id="pin" inputmode="numeric" maxlength="4" type="password"></label><p id="msg" class="muted"></p></div>',
        '<button class="btn ghost" id="back">Back</button><button class="btn" id="go">Add me</button>');
      $('#back').onclick = drivers;
      ['#nm', '#pin'].forEach(function (s) { $(s).oninput = function () { clearMiss(this); }; });
      $('#go').onclick = function () {
        var miss = []; if ($('#nm').value.trim().length < 2) miss.push($('#nm')); if (!/^\d{4}$/.test($('#pin').value)) miss.push($('#pin'));
        if (!showMissed(miss, 'box')) return;
        api('addDriver', { name: $('#nm').value.trim(), pin: $('#pin').value }).then(function () {
          S.driver = localStorage.driver = $('#nm').value.trim(); return load();
        }).then(route).catch(function (e) { $('#msg').textContent = e.message === 'offline' ? 'You need signal to add yourself.' : e.message; $('#msg').style.color = 'var(--red)'; buzz(); });
      };
    };
  }

  function busStatus(b) {
    if (b.status === 'DO NOT OPERATE') return '<span class="dno">DO NOT OPERATE</span>' + (b.statusNote ? '<div class="muted">' + esc(b.statusNote) + '</div>' : '');
    if (b.last) return '<span class="ok">✔ Pre-started today at ' + hm(b.last.at) + ' by ' + esc(String(b.last.driver).split(' ')[0]) + '</span>';
    return '<span class="no">Not done yet</span>';
  }

  function home() {
    KV.keys().then(function (ks) {
      var drafts = ks.filter(function (k) { return String(k).indexOf('draft:') === 0; });
      return Promise.all(drafts.map(function (k) { return KV.get(k); }));
    }).then(function (drafts) {
      drafts = drafts.filter(function (d) { return d && d.driver === S.driver; });
      var buses = S.boot.buses || [];
      setView('home',
        (S.boot.offline ? '<div class="card muted">No signal – showing the last saved list.</div>' : '') +
        '<div class="muted">Driver: <b>' + esc(S.driver) + '</b> · <a href="#" id="chg">not you?</a></div>' +
        (drafts.length ? '<h3>Finish a saved pre-start</h3>' + drafts.map(function (d) { return '<button class="row btn o draft" data-k="' + d.draftId + '">Resume ' + esc(d.busName) + ' (' + hm(d.savedAt) + ')</button>'; }).join('') : '') +
        '<h3>Pick your bus</h3><div class="list">' + buses.map(function (b) {
          return '<div class="card bus ' + (b.status === 'DO NOT OPERATE' ? 'dnoc' : '') + '" data-b="' + esc(b.id) + '"><div class="big">' + esc(b.name) + '</div><div class="muted">' + esc(b.rego) + ' · ' + esc(b.make) + ' ' + esc(b.model) + '</div><div class="status">' + busStatus(b) + '</div>' +
            '<button class="btn pick" data-b="' + esc(b.id) + '">Start pre-start</button>' +
            '<button class="btn ghost book" data-b="' + esc(b.id) + '">Pre-start book – show the inspector</button>' +
            (b.status === 'DO NOT OPERATE' ? '<button class="btn red unlock" data-b="' + esc(b.id) + '">Manager: return to service</button>' : '') + '</div>';
        }).join('') + '</div>' +
        '<button class="btn o" id="rep">Report a problem / hazard / near miss</button><button class="btn ghost" id="mine">My pre-starts</button>');
      $('#chg').onclick = function (e) { e.preventDefault(); localStorage.removeItem('driver'); S.driver = ''; drivers(); };
      $$('.pick').forEach(function (b) { b.onclick = function () { startCheck(b.dataset.b); }; });
      $$('.book').forEach(function (b) { b.onclick = function () { book(b.dataset.b); }; });
      $$('.unlock').forEach(function (b) { b.onclick = function () { unlock(b.dataset.b); }; });
      $$('.draft').forEach(function (b) { b.onclick = function () { KV.get(b.dataset.k).then(resume); }; });
      $('#rep').onclick = function () { report(); };
      $('#mine').onclick = mine;
      netBadge();
    });
  }

  function findBus(id) { return (S.boot.buses || []).filter(function (b) { return b.id === id; })[0]; }

  function startCheck(id) {
    var b = findBus(id); if (!b) { alert('Bus ' + id + ' not found'); return home(); }
    S.bus = b; S.answers = {}; S.start = { site: '', odo: '', dec: {} }; S.draftId = 'draft:' + uid(); S.sections = window.Checklists.build(b); S.step = 0;
    startScreen();
  }
  function resume(d) {
    if (!d) return home();
    S.bus = findBus(d.busId) || d.bus; S.answers = d.answers; S.start = d.start; S.draftId = d.draftId; S.sections = window.Checklists.build(S.bus); S.step = d.step || 0;
    if (S.step === 0) startScreen(); else checkScreen();
  }
  function saveDraft() {
    return KV.set(S.draftId, { draftId: S.draftId, driver: S.driver, busId: S.bus.id, busName: S.bus.name, bus: S.bus, answers: S.answers, start: S.start, step: S.step, savedAt: Date.now() });
  }

  var DECS = [['fit', 'I am fit for work'], ['sober', 'I am not affected by alcohol or drugs'], ['rested', 'I am not fatigued and have had enough rest'], ['licence', 'My driver licence and passenger transport accreditation are current'], ['ppe', 'I am in uniform and have my PPE (hi-vis)']];

  function startScreen() {
    var b = S.bus, st = S.start, sites = S.boot.sites || [];
    var dno = b.status === 'DO NOT OPERATE' ? '<div class="card" style="border:3px solid var(--red)"><span class="dno">DO NOT OPERATE</span><p>This bus has a safety fault: ' + esc(b.statusNote) + '. Do not drive it. Tell your manager.</p></div>' : '';
    setView('start', dno + '<h2>' + esc(b.name) + ' <span class="muted">' + esc(b.rego) + '</span></h2>' +
      '<div class="card" id="f-site"><b>Depot / site or route</b><select id="site"><option value="">Choose…</option>' + sites.map(function (s) { return '<option' + (st.site === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<input id="site2" placeholder="…or type a location / route" value="' + esc(sites.indexOf(st.site) < 0 ? st.site : '') + '"></div>' +
      '<div class="card" id="f-odo"><b>Odometer (km)</b><input id="odo" inputmode="numeric" pattern="[0-9]*" value="' + esc(st.odo) + '"></div>' +
      '<h3>Fit for duty</h3>' + DECS.map(function (d) { return '<label class="chk" id="f-' + d[0] + '"><input type="checkbox" data-d="' + d[0] + '"' + (st.dec[d[0]] ? ' checked' : '') + '><span>' + d[1] + '</span></label>'; }).join(''),
      '<button class="btn ghost" id="back">Back</button><button class="btn" id="next">Next</button>');
    $('#back').onclick = function () { home(); };
    $('#site').onchange = function () { st.site = this.value; if (this.value) $('#site2').value = ''; clearMiss($('#f-site')); saveDraft(); };
    $('#site2').oninput = function () { st.site = this.value.trim(); if (this.value) $('#site').value = ''; clearMiss($('#f-site')); saveDraft(); };
    $('#odo').oninput = function () { st.odo = this.value.replace(/\D/g, ''); if (st.odo) clearMiss($('#f-odo')); saveDraft(); };
    $$('[data-d]').forEach(function (c) { c.onchange = function () { st.dec[c.dataset.d] = c.checked; if (c.checked) clearMiss($('#f-' + c.dataset.d)); saveDraft(); }; });
    $('#next').onclick = function () {
      var miss = []; if (!st.site) miss.push($('#f-site')); if (!st.odo) miss.push($('#f-odo'));
      DECS.forEach(function (d) { if (!st.dec[d[0]]) miss.push($('#f-' + d[0])); });
      if (!showMissed(miss, 'check')) return;
      S.step = 1; saveDraft(); checkScreen();
    };
  }

  var CHIPS = ['Damaged', 'Not working', 'Missing', 'Loose', 'Leaking', 'Low', 'Worn', 'Dirty', 'Out of date'];

  function checkScreen() {
    var si = S.step - 1, sec = S.sections[si], total = S.sections.length;
    setView('check', '<div class="prog"><div style="width:' + Math.round(100 * si / total) + '%"></div></div><div class="muted">' + esc(S.bus.name) + ' · section ' + (si + 1) + ' of ' + total + '</div><h2>' + esc(sec.title) + '</h2>' +
      '<button class="btn o" id="allok">✔ All OK in this section</button>' +
      sec.items.map(function (it) { return '<div class="item" id="it-' + it.id + '" data-i="' + it.id + '"></div>'; }).join(''),
      '<button class="btn ghost" id="back">Back</button><button class="btn" id="next">' + (si + 1 === total ? 'Next: sign' : 'Next') + '</button>');
    sec.items.forEach(drawItem);
    $('#allok').onclick = function () { sec.items.forEach(function (it) { var a = S.answers[it.id]; if (!a || a.a !== 'FAULT') S.answers[it.id] = { a: 'OK' }; drawItem(it); clearMiss($('#it-' + it.id)); }); saveDraft(); };
    $('#back').onclick = function () { S.step--; saveDraft(); S.step === 0 ? startScreen() : checkScreen(); };
    $('#next').onclick = function () {
      var miss = sec.items.filter(function (it) { return !S.answers[it.id]; }).map(function (it) { return $('#it-' + it.id); });
      if (!showMissed(miss, 'check')) return;
      S.step++; saveDraft(); S.step > total ? signScreen() : checkScreen();
    };
  }

  function drawItem(it) {
    var el = $('#it-' + it.id), a = S.answers[it.id] || {};
    el.innerHTML = '<div><b>' + esc(it.label) + '</b>' + (it.must ? '<span class="must">MUST PASS</span>' : '') + '</div>' +
      '<div class="ans">' + ['OK', 'FAULT', 'NA'].map(function (x) { return '<button data-a="' + x + '" class="' + (a.a === x ? 'sel' : '') + '">' + (x === 'NA' ? 'N/A' : x) + '</button>'; }).join('') + '</div>' +
      (a.a === 'FAULT' ? '<div class="chips">' + CHIPS.map(function (c) { return '<button data-c="' + c + '" class="' + ((a.chips || []).indexOf(c) >= 0 ? 'sel' : '') + '">' + c + '</button>'; }).join('') + '</div>' +
        '<textarea placeholder="Note (optional)" rows="2">' + esc(a.note || '') + '</textarea>' +
        '<label class="btn ghost" style="display:block;text-align:center">📷 Add photo<input type="file" accept="image/*" capture="environment" hidden></label>' +
        (a.photo ? '<img class="thumb" src="' + a.photo + '">' : '') +
        (it.must ? '<p style="color:var(--red);font-weight:700">This is a MUST PASS item. The bus will be marked DO NOT OPERATE.</p>' : '') : '');
    $$('[data-a]', el).forEach(function (b) { b.onclick = function () {
      var cur = S.answers[it.id] || {};
      S.answers[it.id] = b.dataset.a === 'FAULT' ? { a: 'FAULT', chips: cur.chips || [], note: cur.note || '', photo: cur.photo } : { a: b.dataset.a };
      drawItem(it); clearMiss(el); saveDraft();
    }; });
    $$('[data-c]', el).forEach(function (b) { b.onclick = function () { var ch = S.answers[it.id].chips, i = ch.indexOf(b.dataset.c); i < 0 ? ch.push(b.dataset.c) : ch.splice(i, 1); b.classList.toggle('sel'); saveDraft(); }; });
    var ta = $('textarea', el); if (ta) ta.oninput = function () { S.answers[it.id].note = ta.value; saveDraft(); };
    var fi = $('input[type=file]', el); if (fi) fi.onchange = function () { shrink(fi.files[0]).then(function (d) { S.answers[it.id].photo = d; drawItem(it); saveDraft(); }); };
  }

  function shrink(file) {
    return new Promise(function (res) {
      if (!file) return res(null);
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () { var k = Math.min(1, 1024 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.7)); };
      img.onerror = function () { res(null); }; img.src = u;
    });
  }

  function faults() {
    var out = [];
    S.sections.forEach(function (s) { s.items.forEach(function (it) { var a = S.answers[it.id]; if (a && a.a === 'FAULT') out.push({ section: s.title, label: it.label, must: it.must, chips: a.chips || [], note: a.note || '', photo: a.photo || null }); }); });
    return out;
  }

  function signScreen() {
    var f = faults(), mustF = f.filter(function (x) { return x.must; });
    setView('sign', '<h2>Check and sign</h2><div class="card"><b>' + esc(S.bus.name) + '</b> · ' + esc(S.start.site) + ' · ' + esc(S.start.odo) + ' km<br>' +
      (f.length ? '<b style="color:var(--red)">' + f.length + ' fault(s):</b><ul>' + f.map(function (x) { return '<li>' + esc(x.label) + (x.must ? ' <span class="must">MUST PASS</span>' : '') + (x.chips.length ? ' – ' + esc(x.chips.join(', ')) : '') + '</li>'; }).join('') + '</ul>' : '<b class="ok">No faults</b>') + '</div>' +
      (mustF.length ? '<div class="card" style="border:3px solid var(--red)"><span class="dno">DO NOT OPERATE</span><p>A MUST PASS item failed. When you submit, this bus will be locked out for everyone until a manager fixes it.</p></div>' : '') +
      '<div class="card" id="f-sig"><b>Sign with your finger</b><canvas id="sig"></canvas><button class="btn ghost" id="clr" style="min-height:40px">Clear</button></div>',
      '<button class="btn ghost" id="back">Back</button><button class="btn o" id="submit">Submit</button>');
    var cv = $('#sig'), ctx, drawn = false, last = null;
    function size() { var r = cv.getBoundingClientRect(), k = window.devicePixelRatio || 1; cv.width = r.width * k; cv.height = r.height * k; ctx = cv.getContext('2d'); ctx.scale(k, k); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#000'; }
    size();
    function pt(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    cv.onpointerdown = function (e) { cv.setPointerCapture(e.pointerId); last = pt(e); };
    cv.onpointermove = function (e) { if (!last) return; var p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; if (!drawn) { drawn = true; clearMiss($('#f-sig')); } };
    cv.onpointerup = cv.onpointercancel = function () { last = null; };
    $('#clr').onclick = function () { size(); drawn = false; };
    $('#back').onclick = function () { S.step = S.sections.length; checkScreen(); };
    $('#submit').onclick = function () {
      if (!showMissed(drawn ? [] : [$('#f-sig')], 'signature')) return;
      var rec = {
        id: uid(), ref: ref(), busId: S.bus.id, busName: S.bus.name, rego: S.bus.rego, driver: S.driver,
        site: S.start.site, odometer: S.start.odo, declarations: S.start.dec, submittedAt: Date.now(),
        sections: S.sections.map(function (s) { return { title: s.title, items: s.items.map(function (it) { var a = S.answers[it.id] || {}; return { label: it.label, must: it.must, answer: a.a, chips: a.chips, note: a.note, photo: a.photo }; }) }; }),
        result: mustF.length ? 'DO NOT OPERATE' : (f.length ? 'PASS WITH FAULTS' : 'PASS'),
        faultSummary: f.map(function (x) { return x.label + (x.chips.length ? ' (' + x.chips.join(', ') + ')' : ''); }).join('; '),
        signature: cv.toDataURL('image/png')
      };
      var btn = this; btn.textContent = 'Saving…';
      KV.set('out:' + rec.id, { action: 'submitPrestart', rec: rec })
        .then(function () { return KV.set('rec:' + rec.id, rec); })
        .then(function () { return KV.del(S.draftId); })
        .then(function () {
          if (mustF.length) { S.bus.status = 'DO NOT OPERATE'; S.bus.statusNote = rec.faultSummary; }
          S.bus.last = { at: rec.submittedAt, driver: rec.driver, ref: rec.ref };
          KV.set('cache:boot', S.boot);
          return flush();
        })
        .then(netBadge).then(function (waiting) { done(rec, waiting); });
    };
  }

  function done(rec, waiting) {
    setView('done', '<div class="card" style="text-align:center"><div style="font-size:60px">' + (rec.result === 'DO NOT OPERATE' ? '⛔' : '✅') + '</div><div class="big">' + esc(rec.result) + '</div><p>Reference <b id="refno">' + esc(rec.ref) + '</b></p>' +
      (waiting ? '<p class="no" id="sendstate"><b>Saved on this phone.</b> No signal – it will send by itself when you have signal. You can close the app.</p>' : '<p class="ok" id="sendstate"><b>Sent.</b> The office has been emailed.</p>') + '</div>',
      '<button class="btn" id="home">Done</button>');
    $('#home').onclick = function () { load().then(home, home); };
  }

  /* ---------- Pre-start book & records (cached offline) ---------- */
  function localRecs(filter) {
    return KV.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return String(k).indexOf('rec:') === 0; }).map(function (k) { return KV.get(k); })); })
      .then(function (rs) { return rs.filter(filter); });
  }
  function merge(server, local) {
    var seen = {}, out = [];
    server.concat(local).forEach(function (r) { if (r && !seen[r.id]) { seen[r.id] = 1; out.push(r); } });
    return out.sort(function (a, b) { return b.submittedAt - a.submittedAt; });
  }
  function listRecs(title, key, action, data, filter) {
    setView('book', '<h2>' + esc(title) + '</h2><p class="muted">Loading…</p>', '<button class="btn ghost" id="back">Back</button>');
    $('#back').onclick = home;
    api(action, data).then(function (r) { KV.set(key, r.records); return r.records; })
      .catch(function () { return KV.get(key).then(function (r) { S.bookOffline = true; return r || []; }); })
      .then(function (server) { return localRecs(filter).then(function (l) { return merge(server, l); }); })
      .then(function (recs) {
        if (S.view !== 'book') return;
        recs.slice(0, 30).forEach(function (r) { KV.set('rec:' + r.id, r); });
        app.innerHTML = '<h2>' + esc(title) + '</h2>' + (S.bookOffline ? '<p class="muted">No signal – showing records saved on this phone.</p>' : '') +
          (recs.length ? recs.map(function (r) { return '<button class="row recrow" data-id="' + r.id + '"><b>' + dt(r.submittedAt) + '</b> · ' + esc(r.busName) + '<div class="muted">' + esc(r.driver) + ' · ' + esc(r.ref) + ' · <span style="color:' + (r.result === 'PASS' ? 'var(--green)' : 'var(--red)') + '">' + esc(r.result) + '</span></div></button>'; }).join('') : '<p>No pre-starts yet.</p>');
        S.bookOffline = false;
        $$('.recrow').forEach(function (b) { b.onclick = function () { record(recs.filter(function (r) { return r.id === b.dataset.id; })[0], function () { listRecs(title, key, action, data, filter); }); }; });
      });
  }
  function book(busId) { var b = findBus(busId); listRecs('Pre-start book – ' + b.name + ' (' + b.rego + ')', 'cache:book:' + busId, 'book', { busId: busId }, function (r) { return r.busId === busId; }); }
  function mine() { listRecs('My pre-starts – ' + S.driver, 'cache:mine:' + S.driver, 'mine', { driver: S.driver }, function (r) { return r.driver === S.driver; }); }

  function record(r, back) {
    var ans = { OK: '<span class="ok">✔ OK</span>', FAULT: '<b style="color:var(--red)">✖ FAULT</b>', NA: 'N/A' };
    setView('record', '<h2>Pre-start ' + esc(r.ref) + '</h2><div class="card rec"><table>' +
      [['Bus', r.busName + ' (' + r.rego + ')'], ['Driver', r.driver], ['Date & time', dt(r.submittedAt)], ['Site / route', r.site], ['Odometer', r.odometer + ' km'], ['Result', r.result]].map(function (x) { return '<tr><td><b>' + x[0] + '</b></td><td>' + esc(x[1]) + '</td></tr>'; }).join('') +
      '</table><h3>Fit for duty</h3><table>' + DECS.map(function (d) { return '<tr><td>' + d[1] + '</td><td>' + (r.declarations && r.declarations[d[0]] ? '✔ Yes' : '✖ No') + '</td></tr>'; }).join('') + '</table>' +
      r.sections.map(function (s) { return '<h3>' + esc(s.title) + '</h3><table>' + s.items.map(function (i) { return '<tr><td>' + esc(i.label) + (i.must ? ' <span class="must">MUST PASS</span>' : '') + (i.chips && i.chips.length ? '<br><i>' + esc(i.chips.join(', ')) + '</i>' : '') + (i.note ? '<br><i>' + esc(i.note) + '</i>' : '') + (i.photo ? '<br><img class="thumb" src="' + esc(i.photo) + '">' : '') + '</td><td>' + (ans[i.answer] || '') + '</td></tr>'; }).join('') + '</table>'; }).join('') +
      '<h3>Signature</h3>' + (r.signature ? '<img src="' + esc(r.signature) + '" style="max-width:100%;background:#fff;border:1px solid #ccc">' : '') + '<p class="muted">Ref ' + esc(r.ref) + ' · ID ' + esc(r.id) + '</p></div>',
      '<button class="btn ghost" id="back">Back</button>');
    $('#back').onclick = back;
  }

  /* ---------- Manager unlock ---------- */
  function unlock(busId) {
    var b = findBus(busId);
    setView('unlock', '<h2>Return ' + esc(b.name) + ' to service</h2><div class="card"><span class="dno">DO NOT OPERATE</span><p>' + esc(b.statusNote) + '</p></div>' +
      '<div class="card"><label id="f-mn">Manager name<input id="mn"></label><label id="f-fx">What was fixed?<textarea id="fx" rows="3"></textarea></label><label id="f-mp">Manager PIN<input id="mp" type="password" inputmode="numeric"></label><p id="msg"></p></div>',
      '<button class="btn ghost" id="back">Back</button><button class="btn red" id="go">Return to service</button>');
    $('#back').onclick = home;
    [['#mn', '#f-mn'], ['#fx', '#f-fx'], ['#mp', '#f-mp']].forEach(function (p) { $(p[0]).oninput = function () { clearMiss($(p[1])); }; });
    $('#go').onclick = function () {
      var miss = []; [['#mn', '#f-mn'], ['#fx', '#f-fx'], ['#mp', '#f-mp']].forEach(function (p) { if (!$(p[0]).value.trim()) miss.push($(p[1])); });
      if (!showMissed(miss, 'box')) return;
      api('unlockBus', { busId: busId, manager: $('#mn').value.trim(), fixed: $('#fx').value.trim(), pin: $('#mp').value }).then(function () { return load(); }).then(home)
        .catch(function (e) { $('#msg').textContent = e.message === 'offline' ? 'You need signal to return a bus to service.' : e.message; $('#msg').style.color = 'var(--red)'; buzz(); });
    };
  }

  /* ---------- Report a problem ---------- */
  function report() {
    var kinds = ['Problem with a bus', 'Hazard', 'Near miss', 'Incident'], st = { kind: '', bus: '', where: '', what: '', photo: null };
    setView('report', '<h2>Report a problem</h2><div class="card" id="f-kind"><b>What is it?</b><div class="chips">' + kinds.map(function (k) { return '<button data-k="' + k + '" style="background:#e9edf3;color:#1a1a1a">' + k + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><b>Bus (if any)</b><select id="rb"><option value="">No bus / not sure</option>' + (S.boot.buses || []).map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.name) + ' ' + esc(b.rego) + '</option>'; }).join('') + '</select>' +
      '<label id="f-where">Where?<input id="rw"></label><label id="f-what">What happened?<textarea id="rt" rows="4"></textarea></label>' +
      '<label class="btn ghost" style="display:block;text-align:center">📷 Add photo<input type="file" id="rp" accept="image/*" capture="environment" hidden></label><div id="rpi"></div></div>',
      '<button class="btn ghost" id="back">Back</button><button class="btn o" id="go">Send report</button>');
    $('#back').onclick = home;
    $$('[data-k]').forEach(function (b) { b.onclick = function () { st.kind = b.dataset.k; $$('[data-k]').forEach(function (x) { x.style.background = '#e9edf3'; x.style.color = '#1a1a1a'; }); b.style.background = 'var(--navy)'; b.style.color = '#fff'; clearMiss($('#f-kind')); }; });
    $('#rw').oninput = function () { clearMiss($('#f-where')); }; $('#rt').oninput = function () { clearMiss($('#f-what')); };
    $('#rp').onchange = function () { shrink(this.files[0]).then(function (d) { st.photo = d; $('#rpi').innerHTML = d ? '<img class="thumb" src="' + d + '">' : ''; }); };
    $('#go').onclick = function () {
      var miss = []; if (!st.kind) miss.push($('#f-kind')); if (!$('#rw').value.trim()) miss.push($('#f-where')); if (!$('#rt').value.trim()) miss.push($('#f-what'));
      if (!showMissed(miss, 'box')) return;
      var rec = { id: uid(), ref: ref().replace('PS', 'RP'), kind: st.kind, busId: $('#rb').value, where: $('#rw').value.trim(), what: $('#rt').value.trim(), photo: st.photo, driver: S.driver, submittedAt: Date.now() };
      KV.set('out:' + rec.id, { action: 'submitReport', rec: rec }).then(flush).then(netBadge).then(function (w) {
        setView('done', '<div class="card" style="text-align:center"><div style="font-size:60px">📨</div><div class="big">Report ' + (w ? 'saved' : 'sent') + '</div><p>Reference <b>' + esc(rec.ref) + '</b></p><p id="sendstate">' + (w ? 'It will send by itself when you have signal.' : 'The office has been emailed.') + '</p></div>', '<button class="btn" id="home">Done</button>');
        $('#home').onclick = home;
      });
    };
  }

  /* ---------- Router ---------- */
  function route() {
    if (!S.driver) return drivers();
    var q = new URLSearchParams(location.search).get('b');
    if (q && !S.qrDone) { S.qrDone = true; if (findBus(q)) return startCheck(q); }
    home();
  }
  load().then(function () { flush(); route(); }).catch(function (e) { app.innerHTML = '<div class="card">' + esc(e.message) + '</div><button class="btn" onclick="location.reload()">Try again</button>'; });
  window.__prestart = { S: S, KV: KV, flush: flush };
})();
