// Builds a checklist for each bus from its type, make, model and wheelchair access.
// Based on NHVR daily-check guidance, SA passenger transport accreditation expectations
// and typical manufacturer daily checks. MUST PASS = safety-critical.
(function (root) {
  function I(label, must) { return { label: label, must: !!must }; }
  function lightBus(b) { return /coaster|rosa|sprinter|civilian|hiace|transit|daily/i.test((b.make || '') + ' ' + (b.model || '')); }
  function electric(b) { return /electric|\bev\b|e12|k9|byd|yutong e|elec|C250EB/i.test((b.make || '') + ' ' + (b.model || '') + ' ' + (b.type || '')); }

  function build(b) {
    b = b || {};
    var type = (b.type || '').toLowerCase();
    var wc = /^(y|yes|true|1)$/i.test(String(b.wheelchair || ''));
    var air = !lightBus(b);
    var ev = electric(b);
    var make = (b.make || '').toLowerCase();

    var ext = [
      I('Tyres: no cuts, bulges or exposed cords; tread OK; inflated (incl. inner duals)', 1),
      I('Wheel nuts: none missing or loose; nut indicators aligned; no rust streaks', 1),
      I('No fuel, oil, coolant, air or hydraulic leaks under the bus', 1),
      I('Mirrors: present, secure, clean and adjusted', 1),
      I('Headlights (high and low beam)', 1),
      I('Indicators and hazard lights, front, side and rear', 1),
      I('Brake lights', 1),
      I('Tail, marker and clearance lights'),
      I('Body panels: no damage or sharp edges; nothing hanging loose'),
      I('Number plates clean and visible'),
      I('Destination signs working and showing the right route'),
      I('Luggage and engine compartment doors closed and latched', 1)
    ];
    if (!ev) ext.push(I('Engine oil, coolant and washer fluid levels (engine off)', 1));
    else ext.push(I('Coolant and washer fluid levels; charging port cover closed and latched', 1));

    var cab = [
      I('Driver seat secure and adjusted; driver seatbelt works', 1),
      I('Windscreen clean, no cracks in the driver\'s view', 1),
      I('Wipers and washers work', 1),
      I('Horn works', 1),
      I('Instruments work; no red warning or STOP lights after start-up', 1),
      I('Steering: no excess free play, heaviness or noises', 1),
      I('Service brakes: tested before moving off', 1),
      I('Park brake holds the bus', 1)
    ];
    if (air) {
      cab.push(I('Air pressure builds to working pressure in normal time', 1));
      cab.push(I('Low-air warning works (buzzer/light) as pressure drops', 1));
      cab.push(I('Drain air tanks (if manual drains fitted); no water or oil'));
    } else {
      cab.push(I('Brake fluid level OK (light bus, hydraulic brakes)', 1));
    }
    cab.push(I('Demister, heater and air-conditioning work'));
    cab.push(I('Two-way radio / phone and ticketing equipment work'));

    var doors = [
      I('Passenger doors open, close and seal properly; no obstructions', 1),
      I('Door interlock: bus will not drive off with a door open', 1),
      I('Emergency exits/doors open freely; signs readable; not blocked', 1),
      I('Emergency hammers present at every window holder', 1),
      I('Roof hatches close and seal')
    ];
    if (lightBus(b)) doors.splice(1, 1, I('Door locks and child locks work as intended', 1));

    var safety = [
      I('Fire extinguisher present, secured, gauge in green, tag in date', 1),
      I('First aid kit present and stocked', 1),
      I('Hi-vis vest, warning triangles and torch on board'),
      I('Spill / bodily-fluid clean-up kit on board')
    ];

    var interior = [
      I('Aisles, steps and floor clear; no trip or slip hazards', 1),
      I('Passenger seats and handrails secure'),
      I('Stop buttons and bells work'),
      I('Interior and step lights work'),
      I('Inside clean; no rubbish, sharps or lost property'),
      I('CCTV on and recording (indicator light / screen)')
    ];
    if (type === 'school' || type === 'coach' || lightBus(b))
      interior.splice(1, 0, I('Passenger seatbelts present, untangled and latching', 1));

    var secs = [
      { title: 'Walk-around: tyres, lights, leaks', items: ext },
      { title: 'Cab and controls', items: cab },
      { title: 'Doors and emergency exits', items: doors },
      { title: 'Safety equipment', items: safety },
      { title: 'Passenger area', items: interior }
    ];

    if (wc) secs.push({ title: 'Wheelchair access', items: [
      I('Wheelchair ramp/lift deploys and stows; safety interlock works', 1),
      I('Wheelchair restraints and occupant belts present and work', 1),
      I('Kneeling works and the warning sounds'),
      I('Priority seating and access signs in place')
    ] });

    var extra = [];
    if (/volvo/.test(make)) extra.push(I('Volvo driver display: no active STOP/red messages after self-test', 1), I('AdBlue level OK (warning not shown)'));
    if (/scania/.test(make)) extra.push(I('Scania instrument cluster: no red stop warnings; retarder works', 1), I('AdBlue level OK'));
    if (/man\b|^man/.test(make)) extra.push(I('MAN EBS self-check finishes with no brake warning', 1), I('AdBlue level OK'));
    if (/mercedes|benz/.test(make)) extra.push(I('Mercedes cluster: no red warnings; AdBlue level OK', 1));
    if (/toyota|hino|fuso|mitsubishi/.test(make)) extra.push(I('Engine belts and hoses: no cracking or fraying (visual)'));
    if (/iveco/.test(make)) extra.push(I('Iveco cluster: no red warnings; AdBlue level OK', 1));
    if (/bustech|cummins/.test(make + ' ' + (b.model || '').toLowerCase())) extra.push(I('Cummins engine: no red warnings; AdBlue level OK', 1), I('Engine belts and hoses: no cracking or fraying (visual)'));
    if (ev) extra.push(I('Traction battery charge is enough for the whole duty', 1), I('No high-voltage or insulation warning lights', 1));
    if (type === 'hybrid') extra.push(I('Hybrid system ready; no hybrid / high-voltage warning lights', 1), I('AdBlue level OK'));
    if (type === 'hydrogen') extra.push(I('Hydrogen tank pressure enough for the whole duty', 1), I('No hydrogen leak alarm or fuel-cell warning lights', 1), I('Hydrogen refuelling receptacle cap fitted; no damage near tanks', 1));
    if (type === 'obahn') extra.push(I('O-Bahn guide wheels and guide arms: no damage, secure', 1), I('Guide wheel tyres: no cuts, flat spots or chunks missing', 1));
    if (type === 'school') extra.push(I('SCHOOL BUS signs and flashing lights work', 1), I('Child check: walk the bus to the back after every run', 1));
    if (type === 'coach') extra.push(I('Luggage bins locked'), I('PA microphone works'), I('Toilet clean and serviced (if fitted)'));
    if (extra.length) secs.push({ title: ((b.make || 'Model') + ' ' + (b.model || '') + ' extra checks').trim(), items: extra });

    secs.forEach(function (s, si) { s.items.forEach(function (it, ii) { it.id = 's' + si + 'i' + ii; }); });
    return secs;
  }
  var api = { build: build };
  if (typeof module !== 'undefined') module.exports = api; else root.Checklists = api;
})(this);
