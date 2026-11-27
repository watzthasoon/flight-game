// EMBERWING II — Ember Valley. The ring course: glowing hoops threaded down
// the river, one per leg, each pulsing until you fly it. Flying a ring
// bursts particles, chimes, pays points and fuel — and points the arrow at
// the next one.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;
  var cfg = EMBER2.config;

  function Rings(scene) {
    this.scene = scene;
    this.list = [];
    this.current = 0;
    this.particles = [];
    this.particleGeo = null;
    this._buildParticles();
  }

  Rings.prototype._buildParticles = function () {
    // One shared Points cloud for every burst; each burst writes its own
    // positions and velocities into it, then it fades.
    var max = 240;
    var pos = new Float32Array(max * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({
      color: 0xffc46b,
      size: 2.2,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    var points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.particleGeo = geo;
    this.particleMat = mat;
    this.particlePoints = points;
    this.particleVel = [];
    this.particleLife = 0;
    for (var i = 0; i < max; i++) this.particleVel.push(new THREE.Vector3());
  };

  // Lay a sortie's rings along the river, seeded so each sortie differs.
  Rings.prototype.buildCourse = function (sortie) {
    this.clear();
    var terrain = EMBER2.terrain;
    var rng = util.makeRng(1000 + sortie.id * 77);
    var n = sortie.rings;
    var zStart = -900;
    var zEnd = -10200;
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0.5 : i / (n - 1);
      var z = zStart + (zEnd - zStart) * t;
      var rx = terrain.riverX(z);
      var lateral = (rng() * 2 - 1) * 150;
      var x = rx + lateral;
      var ground = terrain.heightAt(x, z);
      var y = Math.max(55, ground + 55 + rng() * 110);
      this._addRing(new THREE.Vector3(x, y, z), sortie.ringRadius, i);
    }
    this.current = 0;
    this._markCurrent();
  };

  Rings.prototype._addRing = function (center, radius, index) {
    var group = new THREE.Group();
    // The hoop: a bright torus with a warm emissive core.
    var torus = new THREE.Mesh(
      new THREE.TorusGeometry(radius, radius * 0.09, 10, 40),
      new THREE.MeshStandardMaterial({
        color: 0x664411,
        emissive: cfg.palette.ringCore,
        emissiveIntensity: 1.4,
      }),
    );
    group.add(torus);
    // An inner glow disc, faint, so the hole reads as a target.
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.96, 28),
      new THREE.MeshBasicMaterial({
        color: cfg.palette.ring,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    group.add(disc);
    // A beacon light on top, so the next ring is visible from far away.
    var beacon = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.14, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0x331100,
        emissive: 0xffb347,
        emissiveIntensity: 2.4,
      }),
    );
    beacon.position.y = radius + radius * 0.2;
    group.add(beacon);
    group.position.copy(center);
    // Rings face the incoming plane: their normal is +Z (toward home).
    group.rotation.y = 0;
    this.scene.add(group);
    this.list.push({
      center: center,
      radius: radius,
      index: index,
      group: group,
      torus: torus,
      disc: disc,
      beacon: beacon,
      flown: false,
      pulse: Math.random() * Math.PI * 2,
    });
  };

  Rings.prototype._markCurrent = function () {
    for (var i = 0; i < this.list.length; i++) {
      var ring = this.list[i];
      var isCurrent = i === this.current && !ring.flown;
      ring.torus.material.emissiveIntensity = isCurrent ? 2.2 : ring.flown ? 0.25 : 1.1;
      ring.disc.material.opacity = isCurrent ? 0.16 : 0.07;
    }
  };

  Rings.prototype.nextRing = function () {
    return this.current < this.list.length ? this.list[this.current] : null;
  };

  Rings.prototype.flownCount = function () {
    var n = 0;
    for (var i = 0; i < this.list.length; i++) if (this.list[i].flown) n++;
    return n;
  };

  Rings.prototype.allFlown = function () {
    return this.current >= this.list.length;
  };

  // Did the plane cross this ring's plane inside its radius? Call with the
  // plane's previous and new positions each frame; the ring's normal is +Z,
  // so crossing means the z sign flips from + to - relative to its centre.
  Rings.prototype.checkPass = function (prevPos, newPos) {
    var ring = this.nextRing();
    if (!ring) return null;
    var prevD = prevPos.z - ring.center.z;
    var newD = newPos.z - ring.center.z;
    if (prevD > 0 && newD <= 0) {
      var dx = newPos.x - ring.center.x;
      var dy = newPos.y - ring.center.y;
      var radial = Math.sqrt(dx * dx + dy * dy);
      if (radial < ring.radius) {
        ring.flown = true;
        this.current++;
        this._markCurrent();
        this._burst(ring.center, ring.radius);
        return { ring: ring, radial: radial, offset: radial / ring.radius };
      }
    }
    return null;
  };

  Rings.prototype._burst = function (center, radius) {
    var max = 240;
    var pos = this.particleGeo.attributes.position;
    var rng = util.makeRng((Math.random() * 1e9) | 0);
    for (var i = 0; i < max; i++) {
      var a = rng() * Math.PI * 2;
      var rr = radius * (0.6 + rng() * 0.5);
      var px = center.x + Math.cos(a) * rr;
      var py = center.y + Math.sin(a) * rr;
      var pz = center.z + (rng() - 0.5) * 6;
      pos.setXYZ(i, px, py, pz);
      var v = new THREE.Vector3(
        Math.cos(a) * (6 + rng() * 14),
        Math.sin(a) * (6 + rng() * 14),
        (rng() - 0.5) * 10,
      );
      this.particleVel[i].copy(v);
    }
    pos.needsUpdate = true;
    this.particleLife = 1;
    this.particleMat.opacity = 0.95;
  };

  Rings.prototype.update = function (dt, time) {
    for (var i = 0; i < this.list.length; i++) {
      var ring = this.list[i];
      if (ring.flown) continue;
      var isCurrent = i === this.current;
      var pulse = 1 + 0.18 * Math.sin(time * 2.6 + ring.pulse);
      ring.group.scale.setScalar(isCurrent ? pulse : 1);
      ring.beacon.material.emissiveIntensity = isCurrent ? 2.4 + Math.sin(time * 4) * 1.2 : 1.4;
    }
    if (this.particleLife > 0) {
      this.particleLife -= dt * 1.4;
      var pos = this.particleGeo.attributes.position;
      for (var j = 0; j < 240; j++) {
        pos.setXYZ(
          j,
          pos.getX(j) + this.particleVel[j].x * dt,
          pos.getY(j) + this.particleVel[j].y * dt,
          pos.getZ(j) + this.particleVel[j].z * dt,
        );
        this.particleVel[j].multiplyScalar(1 - dt * 1.5);
      }
      pos.needsUpdate = true;
      this.particleMat.opacity = Math.max(0, this.particleLife) * 0.95;
    }
  };

  Rings.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) {
      this.scene.remove(this.list[i].group);
    }
    this.list = [];
    this.current = 0;
    if (this.particleMat) this.particleMat.opacity = 0;
    this.particleLife = 0;
  };

  EMBER2.Rings = Rings;
})();
