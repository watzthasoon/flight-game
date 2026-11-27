// EMBERWING II — Ember Valley. Small math helpers and the seeded noise the
// valley is built from. Everything here is deterministic: the same seed
// always grows the same valley, so a screenshot can be staged again.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function degToRad(d) {
    return (d * Math.PI) / 180;
  }

  function radToDeg(r) {
    return (r * 180) / Math.PI;
  }

  // Wrap an angle to (-PI, PI].
  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }

  // Smallest signed turn from `from` to `to`, in (-PI, PI].
  function angleDelta(from, to) {
    return wrapAngle(to - from);
  }

  // A tiny seeded generator (mulberry32): enough for scattering trees and
  // rocks, and it never touches Math.random, so the valley is repeatable.
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2D value noise: a hash of integer lattice points, smoothly interpolated.
  // Cheap, repeatable, and smooth enough for valley walls and plateaus.
  function hash2(ix, iz, seed) {
    var h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function valueNoise(x, z, seed) {
    var ix = Math.floor(x);
    var iz = Math.floor(z);
    var fx = x - ix;
    var fz = z - iz;
    var a = hash2(ix, iz, seed);
    var b = hash2(ix + 1, iz, seed);
    var c = hash2(ix, iz + 1, seed);
    var d = hash2(ix + 1, iz + 1, seed);
    var u = fade(fx);
    var v = fade(fz);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }

  // Fractal Brownian motion: layered value noise, 4 octaves. `scale` is the
  // feature size in metres; the result is roughly in [0, 1].
  function fbm(x, z, seed, scale) {
    var total = 0;
    var amp = 0.5;
    var freq = 1 / scale;
    for (var o = 0; o < 4; o++) {
      total += amp * valueNoise(x * freq, z * freq, seed + o * 101);
      amp *= 0.5;
      freq *= 2.03;
    }
    return total;
  }

  // Format helpers for the HUD.
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function formatTime(seconds) {
    var s = Math.max(0, Math.floor(seconds));
    var m = Math.floor(s / 60);
    return m + ':' + pad2(s % 60);
  }

  EMBER2.util = {
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    degToRad: degToRad,
    radToDeg: radToDeg,
    wrapAngle: wrapAngle,
    angleDelta: angleDelta,
    makeRng: makeRng,
    hash2: hash2,
    valueNoise: valueNoise,
    fbm: fbm,
    formatTime: formatTime,
  };
})();
