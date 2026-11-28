// Filter and pupil wheel playground. Click a slot to turn it into the beam and show its details.
// Specs from the ORKID docs (instrument page: JATIS bands, bench Strehl 2026-10-16). Slot order on the wheels is schematic.
(function () {
  var SLOTS = {
    fw: [
      { pos: 'FW_BESSELL_R', short: 'R', name: 'Bessell R', part: 'Chroma 27052', centre: '625 nm', range: '554–696 nm', trans: '93 % avg', sr: '0.48', note: 'Broadband: ADC needed away from zenith.' },
      { pos: 'FW_O_I', short: '[O I]', name: '[O I]', centre: '630 nm', range: '620–640 nm', trans: '90 % peak', sr: '0.57', note: 'Shortest narrowband.' },
      { pos: 'FW_H_A_CONT', short: 'Hα-c', name: 'Hα continuum', centre: '643 nm', range: '634–646 nm', trans: '90 % peak', sr: '0.34', note: 'Known bad since commissioning (2022): streaked image. Not for science.', bad: true },
      { pos: 'FW_H_A', short: 'Hα', name: 'Hα', part: 'Chroma 27002', centre: '656.3 nm', range: '651–661 nm', trans: '94 % peak', sr: '0.585', note: 'First-light and characterisation filter. The NRM filter tonight.' },
      { pos: 'FW_SLOAN_I', short: 'i', name: 'Sloan i', part: 'Chroma 27058', centre: '771 nm', range: '698–853 nm', trans: '95 % avg', sr: '0.58', note: 'Broadband; about 8× the Jovian flux on the bench source.' },
      { pos: 'FW_OPEN', short: 'open', name: 'Open', open: true, note: 'No filter in the filter wheel.' }
    ],
    pw: [
      { pos: 'PW_JOVIAN', short: 'Jov', name: 'Jovian methane', part: 'Chroma 27012', centre: '889 nm', range: '871–907 nm', trans: '94 % avg', sr: '0.64', note: 'Preferred daytime sharpening filter.' },
      { pos: 'PW_SLOAN_Z', short: 'z', name: 'Sloan z', part: 'Chroma 27059', centre: '≈ 915 nm', range: '830–1000+ nm', trans: '90 % avg', sr: '0.67', note: 'Highest bench Strehl. The red end is set by the AO bench dichroic, ≈ 950–970 nm.' },
      { pos: 'PW_CT940_20BP', short: '940', name: 'CT940/20', centre: '940 nm', range: '920–960 nm', trans: '93 % peak', sr: '0.55', note: 'Titan window; about 12 % extra loss on the bench.' },
      { pos: 'PW_ND2', short: 'ND2', name: 'Neutral density 2', trans: '1 % nominal', note: 'Bright targets, bench source. On 10 Lac (Oct 23) it cut Sloan i by only ≈ 17×, so it is weaker in the red.' },
      { pos: 'PW_NRM', short: 'NRM', name: 'Non-redundant mask', note: '9 holes (0.8 m each, projected) on a 3 mm AR window, in the pupil. Use with a filter-wheel filter.', nrm: true },
      { pos: 'PW_OPEN', short: 'open', name: 'Open', open: true, note: 'Nothing in the pupil wheel.' }
    ]
  };
  var TITLES = { fw: 'Filter wheel', pw: 'Pupil wheel' };
  var WHEEL_NOTE = { fw: 'Thorlabs FW102C, six positions, tilted ≈ 4° to kill ghosts between the wheels.', pw: 'Thorlabs FW102C, six positions, at the pupil.' };
  var root = document.getElementById('wheels');
  if (!root) return;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nrmDots() {
    return [[-6, -5], [-1, -7], [5, -5], [-7, 1], [0, -1], [6, 2], [-4, 6], [2, 6], [7, 7]].map(function (p) { return '<circle class="wh-hole" cx="' + p[0] + '" cy="' + p[1] + '" r="1.6"/>'; }).join('');
  }
  function wheelSvg(id) {
    var slots = SLOTS[id], r = 44;
    var svg = '<figure class="wh"><svg viewBox="-72 -82 144 156" role="group" aria-label="' + TITLES[id] + '"><g class="wh-rot" id="wh-' + id + '"><circle class="wh-disc" r="58"/>';
    slots.forEach(function (s, i) {
      var a = i * 360 / slots.length * Math.PI / 180;
      svg += '<g class="wh-slot' + (s.open ? ' open' : '') + (s.bad ? ' bad' : '') + '" data-wheel="' + id + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + esc(s.name + ' (' + s.pos + ')') + '" transform="translate(' + (r * Math.sin(a)).toFixed(2) + ' ' + (-r * Math.cos(a)).toFixed(2) + ')">' +
        '<circle class="wh-glass" r="14"/>' + (s.nrm ? nrmDots() : '<text class="wh-lbl">' + esc(s.short) + '</text>') + '</g>';
    });
    svg += '<circle class="wh-hub" r="7"/></g><path class="wh-beam" d="M0 -61 L-6 -71 L6 -71 Z"/><text class="wh-beam-lbl" y="-75">beam</text></svg>';
    return svg + '<figcaption><span>' + TITLES[id] + '</span><code id="wh-' + id + '-pos"></code></figcaption></figure>';
  }

  root.innerHTML = '<div class="wh-pair">' + wheelSvg('fw') + wheelSvg('pw') + '</div>' +
    '<p class="wh-combo" id="wh-combo" aria-live="polite"></p><div class="wh-info" id="wh-info" aria-live="polite"></div>' +
    '<p class="wh-note">Click a slot to turn it into the beam. Slot order on the wheels is schematic; specs from the ORKID docs.</p>';
  var state = { fw: { i: 5, angle: -300 }, pw: { i: 5, angle: -300 } };

  function moveTime(steps) { return steps === 0 ? 0 : [0, 0.9, 1.7, 2.5][steps]; }
  function render(id, animate) {
    var st = state[id], g = document.getElementById('wh-' + id);
    g.style.transitionDuration = animate ? st.dur + 's' : '0s';
    g.style.transform = 'rotate(' + st.angle + 'deg)';
    g.querySelectorAll('.wh-slot').forEach(function (s) {
      s.classList.toggle('on', +s.dataset.i === st.i);
      var t = s.querySelector('.wh-lbl');
      if (t) { t.style.transitionDuration = g.style.transitionDuration; t.style.transform = 'rotate(' + (-st.angle) + 'deg)'; }
    });
    document.getElementById('wh-' + id + '-pos').textContent = SLOTS[id][st.i].pos;
  }
  function combo() {
    var f = SLOTS.fw[state.fw.i], p = SLOTS.pw[state.pw.i], msg, warn = false;
    if (f.open && p.open) { msg = 'Open + open: no defined wavelength; the Strehl tool refuses it.'; warn = true; }
    else if (p.nrm && f.open) { msg = 'NRM needs a filter-wheel filter (Hα tonight).'; warn = true; }
    else if (p.nrm) msg = 'NRM through ' + f.name + ': the standard NRM setup.';
    else if (p.pos === 'PW_ND2') msg = (f.open ? 'ND2 alone' : f.name + ' + ND2') + ': attenuated beam.';
    else if (!f.open && !p.open) { msg = 'Crossed filters: ' + f.name + ' and ' + p.name + ' barely overlap, so almost no light gets through. Use one wheel at a time.'; warn = true; }
    else msg = 'In the beam: ' + (f.open ? p.name : f.name) + '.';
    if (f.bad) { msg += ' Hα continuum is a known bad filter.'; warn = true; }
    var el = document.getElementById('wh-combo');
    el.textContent = msg;
    el.classList.toggle('warn', warn);
  }
  function info(id, i, dur) {
    var s = SLOTS[id][i], rows = [['Position', s.pos], ['Part', s.part], ['Centre', s.centre], ['Band', s.range], ['Transmission', s.trans], ['Bench Strehl', s.sr]];
    document.getElementById('wh-info').innerHTML = '<h3>' + esc(s.name) + ' <span>' + TITLES[id] + '</span></h3><dl>' +
      rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
      '<p>' + esc(s.note) + '</p><p class="wh-move">' + WHEEL_NOTE[id] + (dur ? ' This move takes ≈ ' + dur + ' s.' : '') + '</p>';
  }
  function select(id, i) {
    var st = state[id], n = SLOTS[id].length;
    var steps = Math.min((i - st.i + n) % n, (st.i - i + n) % n);
    var target = -i * 360 / n, delta = ((target - st.angle) % 360 + 540) % 360 - 180;
    st.i = i; st.angle += delta; st.dur = moveTime(steps);
    render(id, true);
    combo();
    info(id, i, st.dur);
  }

  root.addEventListener('click', function (e) {
    var s = e.target.closest('.wh-slot');
    if (s) select(s.dataset.wheel, +s.dataset.i);
  });
  root.addEventListener('keydown', function (e) {
    var s = e.target.closest('.wh-slot');
    if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(s.dataset.wheel, +s.dataset.i); }
  });

  state.fw = { i: 3, angle: -180, dur: 0 };
  state.pw = { i: 4, angle: -240, dur: 0 };
  render('fw', false); render('pw', false); combo(); info('pw', 4, 0);
})();
