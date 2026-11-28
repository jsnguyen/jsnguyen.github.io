// Filter and pupil wheel visualizer. Listens for 'orkid:wheels' from the plan page and rotates each wheel so the
// selected slot sits in the beam. Slot order follows the docs' listing; the physical order on the wheels may differ.
(function () {
  var FW = [['FW_BESSELL_R', 'R'], ['FW_O_I', '[O I]'], ['FW_H_A_CONT', 'Hα-c'], ['FW_H_A', 'Hα'], ['FW_SLOAN_I', 'i'], ['FW_OPEN', 'open']];
  var PW = [['PW_JOVIAN', 'Jov'], ['PW_SLOAN_Z', 'z'], ['PW_CT940_20BP', '940'], ['PW_ND2', 'ND2'], ['PW_NRM', 'NRM'], ['PW_OPEN', 'open']];
  var NAMES = { R: 'R', OI: '[O I]', Ha: 'Hα', i: 'i', Jov: 'Jovian', z: 'z', CT940: 'CT940', NRM: 'Hα + NRM' };
  var STEP_MS = 2500;
  var root = document.getElementById('wheels');
  if (!root) return;

  function nrmDots() {
    var d = '';
    [[-6, -5], [-1, -7], [5, -5], [-7, 1], [0, -1], [6, 2], [-4, 6], [2, 6], [7, 7]].forEach(function (p) { d += '<circle class="wh-hole" cx="' + p[0] + '" cy="' + p[1] + '" r="1.6"/>'; });
    return d;
  }
  function wheelSvg(id, title, slots) {
    var r = 44, svg = '<figure class="wh"><svg viewBox="-62 -70 124 132" role="img" aria-label="' + title + '"><g class="wh-rot" id="wh-' + id + '"><circle class="wh-disc" r="58"/>';
    slots.forEach(function (s, i) {
      var a = i * 360 / slots.length * Math.PI / 180;
      var open = /_OPEN$/.test(s[0]), nrm = s[0] === 'PW_NRM';
      svg += '<g class="wh-slot' + (open ? ' open' : '') + '" data-pos="' + s[0] + '" transform="translate(' + (r * Math.sin(a)).toFixed(2) + ' ' + (-r * Math.cos(a)).toFixed(2) + ')">' +
        '<circle class="wh-glass" r="13"/>' + (nrm ? nrmDots() : '<text class="wh-lbl">' + s[1] + '</text>') + '</g>';
    });
    svg += '<circle class="wh-hub" r="7"/></g><path class="wh-beam" d="M0 -61 L-5 -69 L5 -69 Z"/></svg><figcaption><span>' + title + '</span><code id="wh-' + id + '-pos"></code></figcaption></figure>';
    return svg;
  }

  root.innerHTML = '<p class="wh-head"></p><div class="wh-pair">' + wheelSvg('fw', 'Filter wheel', FW) + wheelSvg('pw', 'Pupil wheel', PW) + '</div><div class="wh-chips" role="group" aria-label="Settings in this block"></div><p class="wh-note">Slot order is schematic.</p>';
  var head = root.querySelector('.wh-head'), chips = root.querySelector('.wh-chips');
  var angle = { fw: 0, pw: 0 }, POS = null, keys = [], idx = 0, pinned = false, timer = null;

  function turn(id, slots, pos) {
    var i = slots.map(function (s) { return s[0]; }).indexOf(pos);
    if (i < 0) return;
    var target = -i * 360 / slots.length, delta = ((target - angle[id]) % 360 + 540) % 360 - 180;
    angle[id] += delta;
    document.getElementById('wh-' + id).style.transform = 'rotate(' + angle[id] + 'deg)';
    root.querySelectorAll('#wh-' + id + ' .wh-slot').forEach(function (g) {
      g.classList.toggle('on', g.dataset.pos === pos);
      var t = g.querySelector('.wh-lbl');
      if (t) t.style.transform = 'rotate(' + (-angle[id]) + 'deg)';
    });
    document.getElementById('wh-' + id + '-pos').textContent = pos;
  }
  function show(i) {
    if (!keys.length) return;
    idx = (i + keys.length) % keys.length;
    var p = POS[keys[idx]];
    turn('fw', FW, p[0]);
    turn('pw', PW, p[1]);
    chips.querySelectorAll('button').forEach(function (b, j) { b.setAttribute('aria-pressed', String(j === idx)); });
  }
  function cycle() {
    clearInterval(timer);
    if (keys.length > 1 && !pinned) timer = setInterval(function () { show(idx + 1); }, STEP_MS);
  }

  document.addEventListener('orkid:wheels', function (e) {
    var b = e.detail.block;
    POS = e.detail.POS;
    pinned = false;
    if (!b) { keys = []; head.textContent = 'No more wheel moves tonight.'; chips.innerHTML = ''; clearInterval(timer); return; }
    keys = b.w.filter(function (k, i) { return b.w.indexOf(k) === i; });
    head.innerHTML = '<strong>' + (e.detail.live ? 'Now' : 'Next') + '</strong> · ' + b.tg + ' · ' + b.t;
    chips.innerHTML = keys.map(function (k) { return '<button type="button" aria-pressed="false">' + (NAMES[k] || k) + '</button>'; }).join('');
    chips.querySelectorAll('button').forEach(function (bt, j) {
      bt.addEventListener('click', function () { pinned = true; clearInterval(timer); show(j); });
    });
    show(0);
    cycle();
  });
})();
