// EMBERWING — Canyon Courier. Small maths helpers, a seeded random generator
// and a value-noise field. The terrain, the rings and the clouds all draw from
// the same seeded noise, so the canyon is identical on every run.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Frame-rate independent exponential smoothing: damp(current, target, rate, dt).
  function damp(current, target, rate, dt) {
    return lerp(current, target, 1 - Math.exp(-rate * dt));
  }

  // Wrap an angle to [-PI, PI].
  function wrapAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  // Shortest signed difference between two headings.
  function angleDiff(from, to) {
    return wrapAngle(to - from);
  }

  // mulberry32: a tiny deterministic PRNG. Same seed, same canyon.
  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smoothstep between two edges.
  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // 2D value noise with a permutation-free hash, plus fractal octaves.
  function makeNoise2D(seed) {
    var rand = mulberry32(seed);
    var perm = new Uint8Array(512);
    var base = new Uint8Array(256);
    for (var i = 0; i < 256; i++) base[i] = i;
    for (var j = 255; j > 0; j--) {
      var k = Math.floor(rand() * (j + 1));
      var tmp = base[j];
      base[j] = base[k];
      base[k] = tmp;
    }
    for (var p = 0; p < 512; p++) perm[p] = base[p & 255];

    function hash(ix, iy) {
      return perm[(perm[ix & 255] + iy) & 255] / 255;
    }
    function fade(t) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }
    function noise(x, y) {
      var ix = Math.floor(x);
      var iy = Math.floor(y);
      var fx = x - ix;
      var fy = y - iy;
      var a = hash(ix, iy);
      var b = hash(ix + 1, iy);
      var c = hash(ix, iy + 1);
      var d = hash(ix + 1, iy + 1);
      var u = fade(fx);
      var v = fade(fy);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    }
    function fbm(x, y, octaves) {
      var sum = 0;
      var amp = 0.5;
      var freq = 1;
      for (var o = 0; o < octaves; o++) {
        sum += amp * noise(x * freq, y * freq);
        amp *= 0.5;
        freq *= 2.03;
      }
      return sum;
    }
    return { noise: noise, fbm: fbm };
  }

  // Format seconds as M:SS.
  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var m = Math.floor(s / 60);
    var rest = s % 60;
    return m + ':' + (rest < 10 ? '0' : '') + rest;
  }

  // Compass point name for a heading in radians (0 = north = -Z).
  function compassPoint(heading) {
    var points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    var deg = ((-heading * 180) / Math.PI % 360 + 360) % 360;
    return points[Math.round(deg / 22.5) % 16];
  }

  EMBER.util = {
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    wrapAngle: wrapAngle,
    angleDiff: angleDiff,
    mulberry32: mulberry32,
    smoothstep: smoothstep,
    makeNoise2D: makeNoise2D,
    formatTime: formatTime,
    compassPoint: compassPoint,
  };
})();
