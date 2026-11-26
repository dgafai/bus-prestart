// Local mock back end. Mirrors Code.gs (Apps Script) so the app can run in demo mode
// (no API_URL set) and so the logic can be tested without Google.
(function (root) {
  function seed() {
    return {
      settings: { company: 'Kelsian Group', crewPin: '1234', managerPin: '9876', emails: 'manager@example.com' },
      buses: [{"id": "52", "name": "Bus 52", "rego": "XS 27KG", "type": "route", "make": "Iveco", "model": "Metro (Volgren Optimus)", "year": "2014", "seats": "38", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1318", "name": "Bus 1318", "rego": "XCL 821", "type": "route", "make": "MAN", "model": "18.260 HOCL-NL", "year": "2002", "seats": "47", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1507", "name": "Bus 1507", "rego": "WTK 763", "type": "route", "make": "MAN", "model": "18.280 HOCL-NL", "year": "2002", "seats": "46", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1248", "name": "Bus 1248", "rego": "XNX 114", "type": "route", "make": "Scania", "model": "L94UB", "year": "2007", "seats": "41", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1409", "name": "Bus 1409", "rego": "SB 36 BV", "type": "obahn", "make": "Scania", "model": "K230UB O-Bahn", "year": "2008", "seats": "41", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1908", "name": "Bus 1908", "rego": "SB 52 GR", "type": "route", "make": "Scania", "model": "K280UB", "year": "2013", "seats": "45", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1941", "name": "Bus 1941", "rego": "SB 85 LU", "type": "route", "make": "Scania", "model": "K320UB", "year": "2016", "seats": "45", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "5761", "name": "Bus 5761", "rego": "XS 13KK", "type": "hybrid", "make": "Scania", "model": "K320HB Hybrid", "year": "2025", "seats": "41", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "5801", "name": "Bus 5801", "rego": "XS 01HJ", "type": "electric", "make": "Scania", "model": "C250EB Electric", "year": "2023", "seats": "41", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "1907", "name": "Bus 1907", "rego": "SB 94 MT", "type": "route", "make": "Bustech", "model": "XDi (Cummins ISL)", "year": "2017", "seats": "", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}, {"id": "H1", "name": "Hydrogen bus (fleet no. TBC)", "rego": "TBC", "type": "hydrogen", "make": "Foton", "model": "FTH12 Hydrogen", "year": "", "seats": "", "wheelchair": "Yes", "status": "In service", "statusNote": "", "active": "Yes"}],
      drivers: ['Sam Driver', 'Alex Driver'],
      sites: [{"name": "Mile End", "email": ""}, {"name": "St Agnes", "email": ""}, {"name": "Edinburgh North", "email": ""}, {"name": "Port Adelaide", "email": ""}, {"name": "Newton", "email": ""}, {"name": "Morphettville", "email": ""}],
      prestarts: [], reports: [], log: [], emails: []
    };
  }
  function today(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function make(storage) {
    var db = storage.load() || seed();
    function save() { storage.save(db); }
    function bus(id) { return db.buses.filter(function (b) { return b.id === id; })[0]; }
    function status(b) {
      var last = null;
      for (var i = db.prestarts.length - 1; i >= 0; i--) if (db.prestarts[i].busId === b.id) { last = db.prestarts[i]; break; }
      var o = JSON.parse(JSON.stringify(b));
      o.last = last && today(last.submittedAt) === today(Date.now()) ? { at: last.submittedAt, driver: last.driver, ref: last.ref } : null;
      return o;
    }
    var H = {
      bootstrap: function () {
        return { company: db.settings.company, buses: db.buses.filter(function (b) { return b.active !== 'No'; }).map(status), drivers: db.drivers.slice(), sites: db.sites.map(function (s) { return s.name; }) };
      },
      addDriver: function (d) {
        if (String(d.pin) !== String(db.settings.crewPin)) throw new Error('Wrong crew PIN');
        var n = String(d.name || '').trim(); if (n.length < 2) throw new Error('Enter your name');
        if (db.drivers.indexOf(n) < 0) db.drivers.push(n); save(); return { ok: true };
      },
      submitPrestart: function (d) {
        var r = d.rec;
        var dup = db.prestarts.filter(function (p) { return p.id === r.id; })[0];
        if (dup) return { ok: true, duplicate: true, ref: dup.ref };
        db.prestarts.push(r);
        var b = bus(r.busId);
        if (b && r.result === 'DO NOT OPERATE') { b.status = 'DO NOT OPERATE'; b.statusNote = r.faultSummary; db.log.push({ when: Date.now(), busId: b.id, action: 'DO NOT OPERATE', who: r.driver, details: r.faultSummary }); }
        db.emails.push({ to: db.settings.emails, subject: 'Pre-start ' + r.ref + ' ' + r.busName + ' ' + r.result });
        save(); return { ok: true, ref: r.ref };
      },
      submitReport: function (d) {
        var r = d.rec;
        if (db.reports.some(function (p) { return p.id === r.id; })) return { ok: true, duplicate: true };
        db.reports.push(r); db.emails.push({ to: db.settings.emails, subject: r.kind + ' report ' + r.ref }); save(); return { ok: true, ref: r.ref };
      },
      unlockBus: function (d) {
        if (String(d.pin) !== String(db.settings.managerPin)) throw new Error('Wrong manager PIN');
        if (!d.fixed || !d.manager) throw new Error('Enter your name and what was fixed');
        var b = bus(d.busId); if (!b) throw new Error('Bus not found');
        b.status = 'In service'; b.statusNote = '';
        db.log.push({ when: Date.now(), busId: b.id, action: 'Returned to service', who: d.manager, details: d.fixed });
        db.emails.push({ to: db.settings.emails, subject: b.name + ' returned to service by ' + d.manager });
        save(); return { ok: true };
      },
      book: function (d) { return { records: db.prestarts.filter(function (p) { return p.busId === d.busId; }).slice().reverse() }; },
      mine: function (d) { return { records: db.prestarts.filter(function (p) { return p.driver === d.driver; }).slice().reverse().slice(0, 50) }; }
    };
    return {
      db: function () { return db; },
      handle: function (action, data) {
        return new Promise(function (res, rej) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) return rej(new Error('offline'));
          if (storage.offline && storage.offline()) return rej(new Error('offline'));
          try { if (!H[action]) throw new Error('Unknown action'); res(JSON.parse(JSON.stringify(H[action](data || {})))); } catch (e) { rej(e); }
        });
      }
    };
  }
  var mem = { v: null, load: function () { return this.v; }, save: function (d) { this.v = d; } };
  if (typeof module !== 'undefined') module.exports = { make: make, mem: mem };
  else root.Mock = make({ load: function () { try { return JSON.parse(localStorage.mockdb); } catch (e) { return null; } }, save: function (d) { localStorage.mockdb = JSON.stringify(d); } });
})(this);
