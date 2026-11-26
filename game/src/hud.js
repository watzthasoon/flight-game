// EMBERWING — Canyon Courier. The instruments and the menus: a canvas
// attitude indicator with a real horizon, a heading tape, a canyon minimap,
// the ring-direction arrow, toasts and warnings, and the title, pause and
// end screens. The DOM is in index.html; this file drives it.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var util = EMBER.util;

  function $(id) {
    return document.getElementById(id);
  }

  var els = {};
  var toastTimer = null;
  var callbacks = {};

  function init(cb) {
    callbacks = cb || {};
    ['hud', 'mission-name', 'rings-count', 'mission-time', 'compass', 'heading-text',
     'fuel-fill', 'fuel-text', 'throttle-text', 'score-text', 'total-score-text',
     'ring-arrow', 'ring-arrow-glyph', 'ring-arrow-dist', 'toast', 'warn',
     'attitude', 'airspeed-text', 'vsi-text', 'altitude-text', 'agl-text',
     'minimap', 'map-dist', 'stick', 'stick-dot', 'hint',
     'title', 'sortie-list', 'fly-button', 'end', 'end-title', 'end-sub',
     'end-stats', 'end-hint', 'end-next', 'end-retry', 'end-menu', 'pause',
     'fatal'].forEach(function (id) {
      els[id] = $(id);
    });
    els['fly-button'].addEventListener('click', function () {
      if (callbacks.onFly) callbacks.onFly();
    });
    els['end-next'].addEventListener('click', function () {
      if (callbacks.onNext) callbacks.onNext();
    });
    els['end-retry'].addEventListener('click', function () {
      if (callbacks.onRetry) callbacks.onRetry();
    });
    els['end-menu'].addEventListener('click', function () {
      if (callbacks.onMenu) callbacks.onMenu();
    });
  }

  function show(id, visible) {
    els[id].classList.toggle('hidden', !visible);
  }

  function showTitle(sorties, unlocked, bests, selected) {
    show('title', true);
    show('end', false);
    show('pause', false);
    show('hud', false);
    var list = els['sortie-list'];
    list.innerHTML = '';
    sorties.forEach(function (sortie, i) {
      var div = document.createElement('div');
      var locked = i > unlocked;
      div.className = 'sortie' + (i === selected ? ' selected' : '') + (locked ? ' locked' : '');
      var best = bests[i] != null ? '<span class="best">BEST ' + bests[i] + '</span>' : '';
      div.innerHTML =
        '<span class="num">' + (i + 1) + '</span>' +
        '<span><span class="name">' + sortie.name + '</span><br>' +
        '<span class="desc">' + sortie.desc + (locked ? ' — finish the previous sortie to unlock' : '') + '</span></span>' +
        best;
      if (!locked) {
        div.addEventListener('click', function () {
          if (callbacks.onSelectSortie) callbacks.onSelectSortie(i);
        });
      }
      list.appendChild(div);
    });
  }

  function showEnd(result) {
    show('end', true);
    show('title', false);
    show('pause', false);
    els['end-title'].textContent = result.title;
    els['end-title'].classList.toggle('red', !result.won);
    els['end-sub'].textContent = result.sub;
    var html = '';
    result.stats.forEach(function (stat) {
      html += '<div class="stat"><span>' + stat.label + '</span><b>' + stat.value + '</b></div>';
    });
    els['end-stats'].innerHTML = html;
    els['end-hint'].innerHTML = result.hint;
    els['end-next'].style.display = result.nextAvailable ? '' : 'none';
  }

  function showPause(visible) {
    show('pause', visible);
  }

  function showFatal() {
    show('fatal', true);
  }

  var toastCount = 0;
  function toast(text, ms) {
    toastCount++;
    els.toast.textContent = text;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, ms || 2200);
  }

  function warn(text) {
    if (text) {
      els.warn.textContent = text;
      els.warn.classList.remove('hidden');
    } else {
      els.warn.classList.add('hidden');
    }
  }

  function drawAttitude(pitch, bank) {
    var canvas = els.attitude;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = 76;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // Horizon: rotate by the bank, shift by the pitch.
    ctx.translate(cx, cy);
    ctx.rotate(-bank);
    ctx.translate(0, pitch * 130);
    var skyGrad = ctx.createLinearGradient(0, -r, 0, 0);
    skyGrad.addColorStop(0, '#2a4a7a');
    skyGrad.addColorStop(1, '#ff8c42');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(-r, -r * 2, r * 2, r * 2);
    ctx.fillStyle = '#4a2a1a';
    ctx.fillRect(-r, 0, r * 2, r * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    // Pitch ladder every 10 degrees.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    [-20, -10, 10, 20].forEach(function (deg) {
      var y = -deg * (Math.PI / 180) * 130;
      var len = deg % 20 === 0 ? 34 : 20;
      ctx.beginPath();
      ctx.moveTo(-len / 2, y);
      ctx.lineTo(len / 2, y);
      ctx.stroke();
      ctx.fillText(String(Math.abs(deg)), len / 2 + 12, y + 3);
    });
    ctx.restore();
    // Rim and bank pointer.
    ctx.strokeStyle = '#ffb454';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-bank);
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    ctx.moveTo(0, -r + 2);
    ctx.lineTo(-7, -r + 14);
    ctx.lineTo(7, -r + 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Fixed aircraft symbol.
    ctx.strokeStyle = '#ffe9c4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy);
    ctx.lineTo(cx + 34, cy);
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();
    ctx.fillStyle = '#ffe9c4';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCompass(headingDeg) {
    var canvas = els.compass;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var range = 120; // degrees visible across the tape
    var pxPerDeg = w / range;
    var centre = w / 2;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (var d = -60; d <= 60; d += 5) {
      var deg = Math.round((headingDeg + d) / 5) * 5;
      var norm = ((deg % 360) + 360) % 360;
      // Fold the offset into [-180, 180] so the tape wraps at north.
      var diff = ((norm - headingDeg + 540) % 360) - 180;
      var x = centre + diff * pxPerDeg;
      if (diff < -60 || diff > 60) continue;
      var major = norm % 30 === 0;
      var cardinal = norm % 90 === 0;
      ctx.strokeStyle = cardinal ? '#ffb454' : 'rgba(245,233,208,0.7)';
      ctx.lineWidth = cardinal ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, cardinal ? 6 : 12);
      ctx.lineTo(x, 22);
      ctx.stroke();
      if (major) {
        var label = cardinal
          ? ['N', 'E', 'S', 'W'][Math.round(norm / 90) % 4]
          : String(norm).padStart(3, '0');
        ctx.fillStyle = cardinal ? '#ffb454' : '#d8c9a8';
        ctx.fillText(label, x, 36);
      }
    }
    // Centre caret.
    ctx.fillStyle = '#ffb454';
    ctx.beginPath();
    ctx.moveTo(centre - 7, 0);
    ctx.lineTo(centre + 7, 0);
    ctx.lineTo(centre, 8);
    ctx.closePath();
    ctx.fill();
  }

  function drawMinimap(state) {
    var canvas = els.minimap;
    var ctx = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 8, 20, 0.6)';
    ctx.fillRect(0, 0, w, h);
    var xMin = -900;
    var xMax = 900;
    var zTop = -11500;
    var zBottom = 1000;
    function mx(x) {
      return ((x - xMin) / (xMax - xMin)) * w;
    }
    function mz(z) {
      return ((z - zBottom) / (zTop - zBottom)) * h;
    }
    // River.
    ctx.strokeStyle = '#2e6b7a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (var z = 1000; z >= -11500; z -= 500) {
      var rx = EMBER.terrain.riverX(z);
      if (z === 1000) ctx.moveTo(mx(rx), mz(z));
      else ctx.lineTo(mx(rx), mz(z));
    }
    ctx.stroke();
    // Strips.
    ctx.fillStyle = '#ffb454';
    var strips = EMBER.config.strips;
    [['start', strips.start], ['dest', strips.dest]].forEach(function (pair) {
      var s = pair[1];
      ctx.fillRect(mx(s.x) - 2, mz(s.z - s.length / 2), 4, (s.length / (zBottom - zTop)) * h);
    });
    // Rings.
    if (state.rings) {
      state.rings.forEach(function (ring, i) {
        var passed = ring.passed;
        var next = state.nextRingIndex === i;
        ctx.fillStyle = passed ? '#3dff7a' : next ? '#ffb347' : 'rgba(255,179,71,0.45)';
        ctx.beginPath();
        ctx.arc(mx(ring.pos.x), mz(ring.pos.z), next ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    // The plane.
    var px = mx(state.pos.x);
    var py = mz(state.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // state: everything the HUD needs, gathered by game.js each frame.
  function update(state) {
    els['mission-name'].textContent = state.missionName;
    els['rings-count'].textContent = state.ringsDone + ' / ' + state.ringsTotal;
    els['mission-time'].textContent = util.formatTime(state.time);
    els['heading-text'].textContent =
      'HDG ' + String(Math.round(state.headingDeg)).padStart(3, '0') + '° ' + util.compassPoint(state.heading);
    els['fuel-fill'].style.width = Math.max(0, state.fuel) + '%';
    els['fuel-fill'].classList.toggle('low', state.fuel < 22);
    els['fuel-text'].textContent = Math.round(state.fuel) + '%';
    els['throttle-text'].textContent = Math.round(state.throttle * 100) + '%';
    els['score-text'].textContent = state.score;
    els['total-score-text'].textContent = state.totalScore;
    els['airspeed-text'].textContent = Math.round(state.speedKt);
    els['vsi-text'].textContent = (state.vsi >= 0 ? '+' : '') + Math.round(state.vsi);
    els['altitude-text'].textContent = Math.round(state.altFt);
    els['agl-text'].textContent = Math.round(state.aglFt);
    els['map-dist'].textContent = state.destDist != null ? Math.round(state.destDist / 100) / 10 + ' km' : '—';

    drawAttitude(state.pitch, state.bank);
    drawCompass(state.headingDeg);
    drawMinimap(state);

    // Ring arrow: points at the next ring when it is off the nose.
    if (state.nextRing) {
      var rel = util.angleDiff(state.heading, state.nextRingBearing);
      var deg = Math.abs(rel * 180 / Math.PI);
      if (deg > 18) {
        els['ring-arrow'].classList.remove('hidden');
        els['ring-arrow-glyph'].style.transform = 'rotate(' + (rel * 180 / Math.PI + 90) + 'deg)';
        els['ring-arrow-dist'].textContent = Math.round(state.nextRing.dist) + ' m';
      } else {
        els['ring-arrow'].classList.add('hidden');
      }
    } else {
      els['ring-arrow'].classList.add('hidden');
    }

    // Mouse stick indicator.
    if (state.mouseStick) {
      els.stick.classList.remove('hidden');
      els['stick-dot'].style.transform =
        'translate(' + state.mouseStick.x * 34 + 'px,' + state.mouseStick.y * 34 + 'px)';
    } else {
      els.stick.classList.add('hidden');
    }

    if (state.time > 20) els.hint.classList.add('hidden');
    else els.hint.classList.remove('hidden');
  }

  EMBER.hud = {
    init: init,
    show: show,
    showTitle: showTitle,
    showEnd: showEnd,
    showPause: showPause,
    showFatal: showFatal,
    toast: toast,
    warn: warn,
    update: update,
  };
})();
