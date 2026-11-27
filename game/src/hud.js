// EMBERWING II — Ember Valley. The HUD: a glass-cockpit style overlay in
// the DOM (crisp at any size, readable in a screenshot). Attitude, compass
// tape, airspeed and altitude, fuel, score, a top-down minimap, and an arrow
// that always points at the next ring. Plus the messages the pilot reads.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;

  function Hud() {
    this.el = {};
    this.minimap = null;
    this.mapCtx = null;
    this.messageTimer = 0;
    this._cache();
  }

  Hud.prototype._cache = function () {
    var ids = [
      'hud', 'hud-sortie', 'hud-rings', 'hud-score', 'hud-fuel-fill', 'hud-fuel-text',
      'hud-wind', 'hud-ias', 'hud-alt', 'hud-vsi', 'hud-agl', 'hud-compass-strip',
      'hud-att-horizon', 'hud-att-roll', 'hud-message', 'hud-arrow', 'hud-arrow-sym',
      'hud-arrow-dist', 'hud-minimap', 'hud-throttle-fill', 'hud-flare',
    ];
    for (var i = 0; i < ids.length; i++) {
      this.el[ids[i]] = document.getElementById(ids[i]);
    }
    if (this.el['hud-minimap']) {
      this.minimap = this.el['hud-minimap'];
      this.mapCtx = this.minimap.getContext('2d');
    }
  };

  Hud.prototype.show = function (visible) {
    if (this.el.hud) this.el.hud.classList.toggle('hidden', !visible);
  };

  Hud.prototype.setSortie = function (sortie, totalRings) {
    if (this.el['hud-sortie']) this.el['hud-sortie'].textContent = sortie.name.toUpperCase();
    if (this.el['hud-rings']) this.el['hud-rings'].textContent = 'RINGS 0/' + totalRings;
  };

  Hud.prototype.message = function (text, seconds) {
    if (!this.el['hud-message']) return;
    this.el['hud-message'].textContent = text;
    this.el['hud-message'].classList.remove('hidden');
    this.messageTimer = seconds || 2.2;
  };

  Hud.prototype.hideMessage = function () {
    if (this.el['hud-message']) this.el['hud-message'].classList.add('hidden');
    this.messageTimer = 0;
  };

  // A short-lived centre-screen flash (ring flown, flare callout).
  Hud.prototype.flash = function (text, seconds) {
    if (!this.el['hud-flare']) return;
    this.el['hud-flare'].textContent = text;
    this.el['hud-flare'].classList.remove('hidden');
    var self = this;
    setTimeout(function () {
      self.el['hud-flare'].classList.add('hidden');
    }, (seconds || 1.4) * 1000);
  };

  // Every frame: instruments from the flight state.
  Hud.prototype.update = function (dt, state) {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.hideMessage();
    }
    if (!state) return;
    var phys = state.physics;
    if (this.el['hud-rings']) {
      this.el['hud-rings'].textContent = 'RINGS ' + state.ringsFlown + '/' + state.ringsTotal;
    }
    if (this.el['hud-score']) this.el['hud-score'].textContent = String(state.score);
    if (this.el['hud-fuel-fill']) {
      this.el['hud-fuel-fill'].style.width = util.clamp(phys.fuel, 0, 100) + '%';
      this.el['hud-fuel-fill'].classList.toggle('low', phys.fuel < 25);
    }
    if (this.el['hud-fuel-text']) {
      this.el['hud-fuel-text'].textContent = 'FUEL ' + Math.round(phys.fuel);
    }
    if (this.el['hud-wind']) {
      this.el['hud-wind'].textContent =
        'WIND ' + Math.round(state.windSpeed) + ' KT ' + state.windDirText;
    }
    if (this.el['hud-ias']) this.el['hud-ias'].textContent = String(Math.round(phys.speed * 1.94));
    if (this.el['hud-alt']) this.el['hud-alt'].textContent = String(Math.round(phys.pos.y * 3.28));
    if (this.el['hud-vsi']) {
      var vsi = phys.vs * 196.85;
      this.el['hud-vsi'].textContent = (vsi >= 0 ? '+' : '') + String(Math.round(vsi));
    }
    if (this.el['hud-agl']) {
      this.el['hud-agl'].textContent = 'AGL ' + Math.max(0, Math.round(state.agl * 3.28)) + ' FT';
    }
    if (this.el['hud-throttle-fill']) {
      this.el['hud-throttle-fill'].style.height = Math.round(phys.throttle * 100) + '%';
    }
    this._updateCompass(phys.heading);
    this._updateAttitude(phys.pitch, phys.roll);
    this._updateArrow(state);
    this._updateMinimap(state);
  };

  Hud.prototype._updateCompass = function (heading) {
    var strip = this.el['hud-compass-strip'];
    if (!strip) return;
    var deg = Math.round(util.radToDeg(heading));
    deg = ((deg % 360) + 360) % 360;
    var points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    var html = '';
    for (var d = -120; d <= 120; d += 15) {
      var h = ((deg + d) % 360 + 360) % 360;
      var label = h % 45 === 0 ? points[Math.round(h / 45) % 8] : String(h);
      var cls = d === 0 ? 'tick centre' : 'tick';
      html += '<span class="' + cls + '" style="left:' + (50 + d * 0.55) + '%">' + label + '</span>';
    }
    strip.innerHTML = html;
    strip.setAttribute('data-heading', String(deg).padStart(3, '0') + '°');
  };

  // Artificial horizon: the horizon line translates with pitch and the whole
  // dial rotates with roll, like a real attitude indicator.
  Hud.prototype._updateAttitude = function (pitch, roll) {
    var horizon = this.el['hud-att-horizon'];
    if (horizon) {
      var shift = util.clamp(-pitch * 130, -46, 46);
      horizon.style.transform = 'translateY(' + shift + 'px)';
    }
    var dial = this.el['hud-att-roll'];
    if (dial) dial.style.transform = 'rotate(' + -util.radToDeg(roll) + 'deg)';
  };

  // The arrow under the compass: rotate it to point at the next ring (or
  // the far strip once the rings are done), and show the distance.
  Hud.prototype._updateArrow = function (state) {
    var arrow = this.el['hud-arrow'];
    if (!arrow || !state.target) return;
    var dx = state.target.x - state.physics.pos.x;
    var dz = state.target.z - state.physics.pos.z;
    var bearing = Math.atan2(-dx, -dz);
    var relative = util.angleDelta(state.physics.heading, bearing);
    var sym = this.el['hud-arrow-sym'];
    if (sym) {
      sym.style.transform = 'rotate(' + util.radToDeg(relative) + 'deg)';
      sym.textContent = state.targetIsStrip ? '▣' : '◎';
    }
    var dist = Math.sqrt(dx * dx + dz * dz);
    var distEl = this.el['hud-arrow-dist'];
    if (distEl) distEl.textContent = (dist / 1000).toFixed(1) + ' KM';
  };

  // Top-down minimap: the valley, the river, both strips, the rings, you.
  Hud.prototype._updateMinimap = function (state) {
    if (!this.mapCtx || !state.minimap) return;
    var ctx = this.mapCtx;
    var w = this.minimap.width;
    var h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
    ctx.fillRect(0, 0, w, h);
    var cfg = EMBER2.config;
    var map = state.minimap;
    var toX = function (x) {
      return ((x - map.x0) / (map.x1 - map.x0)) * w;
    };
    var toY = function (z) {
      return ((z - map.z1) / (map.z0 - map.z1)) * h;
    };
    // River. (z runs south→north, so count down from z0 to z1.)
    ctx.strokeStyle = 'rgba(80, 160, 190, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var z = map.z0; z >= map.z1; z -= 400) {
      var rx = EMBER2.terrain.riverX(z);
      if (z === map.z0) ctx.moveTo(toX(rx), toY(z));
      else ctx.lineTo(toX(rx), toY(z));
    }
    ctx.stroke();
    // Strips.
    ctx.fillStyle = '#e8e4da';
    var strips = [cfg.strips.home, cfg.strips.far];
    for (var i = 0; i < strips.length; i++) {
      ctx.fillRect(toX(strips[i].x) - 3, toY(strips[i].z) - 8, 6, 16);
    }
    // Rings: flown dim, next bright.
    for (var r = 0; r < state.ringPositions.length; r++) {
      var rp = state.ringPositions[r];
      ctx.beginPath();
      ctx.arc(toX(rp.x), toY(rp.z), rp.flown ? 2.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = rp.flown ? 'rgba(120, 120, 120, 0.8)' : r === state.ringsFlown ? '#ffb347' : 'rgba(255, 179, 71, 0.45)';
      ctx.fill();
    }
    // You: a little triangle pointing along the heading.
    var px = toX(state.physics.pos.x);
    var py = toY(state.physics.pos.z);
    var hd = state.physics.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-hd);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  EMBER2.Hud = Hud;
})();
