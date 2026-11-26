// EMBERWING — Canyon Courier. The glowing rings: where they sit, what they
// look like, and whether the plane has flown through them. Rings follow the
// river down the canyon; the last one lines the plane up with the destination
// strip. A burst of sparks marks a ring flown.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var palette = EMBER.config.palette;
  var util = EMBER.util;

  var BURST_COUNT = 70;
  var BURST_LIFE = 0.9;

  function buildRings(scene, sortie) {
    var rand = util.mulberry32(EMBER.config.canyon.seed + sortie.id * 131);
    var dest = EMBER.config.strips.dest;
    var rings = [];
    var group = new THREE.Group();
    scene.add(group);

    var zStart = -900;
    var zEnd = -10300;
    for (var i = 0; i < sortie.rings; i++) {
      var t = sortie.rings === 1 ? 0 : i / (sortie.rings - 1);
      var z = util.lerp(zStart, zEnd, t) + (rand() - 0.5) * 260;
      var last = i === sortie.rings - 1;
      var x = last ? 0 : EMBER.terrain.riverX(z) + (rand() - 0.5) * 320;
      var y = last ? 150 : 130 + rand() * 150;
      var radius = sortie.ringRadius * (0.94 + rand() * 0.12);
      rings.push(makeRing(group, new THREE.Vector3(x, y, z), radius, i));
    }

    // One reusable spark burst.
    var burstGeo = new THREE.BufferGeometry();
    var burstPos = new Float32Array(BURST_COUNT * 3);
    burstGeo.setAttribute('position', new THREE.BufferAttribute(burstPos, 3));
    var burstMat = new THREE.PointsMaterial({
      color: 0xffb347,
      size: 4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    var burst = new THREE.Points(burstGeo, burstMat);
    burst.frustumCulled = false;
    scene.add(burst);
    var burstVel = [];
    var burstAge = Infinity;

    function makeRing(parent, pos, radius, index) {
      var ring = new THREE.Group();
      var torus = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 1.7, 10, 30),
        new THREE.MeshBasicMaterial({ color: palette.ringCore }),
      );
      ring.add(torus);
      var halo = new THREE.Mesh(
        new THREE.TorusGeometry(radius + 2.2, 2.6, 8, 30),
        new THREE.MeshBasicMaterial({
          color: palette.ring,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      );
      ring.add(halo);
      // A light pillar so the ring can be spotted from far down the canyon.
      var pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 420, 8, 1, true),
        new THREE.MeshBasicMaterial({
          color: palette.ring,
          transparent: true,
          opacity: 0.10,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      pillar.position.y = 210;
      ring.add(pillar);
      ring.position.copy(pos);
      parent.add(ring);
      return {
        index: index,
        pos: pos,
        radius: radius,
        group: ring,
        torus: torus,
        halo: halo,
        pillar: pillar,
        passed: false,
      };
    }

    function fireBurst(centre) {
      for (var i = 0; i < BURST_COUNT; i++) {
        burstPos[i * 3] = centre.x;
        burstPos[i * 3 + 1] = centre.y;
        burstPos[i * 3 + 2] = centre.z;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(Math.random() * 2 - 1);
        var speed = 12 + Math.random() * 26;
        burstVel[i] = new THREE.Vector3(
          speed * Math.sin(phi) * Math.cos(theta),
          speed * Math.cos(phi),
          speed * Math.sin(phi) * Math.sin(theta),
        );
      }
      burstGeo.attributes.position.needsUpdate = true;
      burstAge = 0;
    }

    function nextRing() {
      for (var i = 0; i < rings.length; i++) {
        if (!rings[i].passed) return rings[i];
      }
      return null;
    }

    function passedCount() {
      var n = 0;
      for (var i = 0; i < rings.length; i++) if (rings[i].passed) n++;
      return n;
    }

    function reset() {
      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        ring.passed = false;
        ring.group.visible = true;
        ring.torus.material.color.setHex(palette.ringCore);
        ring.halo.material.opacity = 0.22;
        ring.pillar.visible = true;
        ring.group.scale.set(1, 1, 1);
      }
      burstAge = Infinity;
      burstMat.opacity = 0;
    }

    // Returns the ring just flown through, or null.
    function update(dt, elapsed, planePos) {
      var hit = null;
      var next = nextRing();
      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        if (ring.passed) continue;
        // The next ring pulses so the eye finds it; the rest sit steady.
        var pulse = ring === next ? 1 + Math.sin(elapsed * 3.2) * 0.06 : 1;
        ring.group.scale.set(pulse, pulse, pulse);
        var dist = planePos.distanceTo(ring.pos);
        if (dist < ring.radius * 0.85) {
          ring.passed = true;
          ring.torus.material.color.setHex(0x3dff7a);
          ring.halo.material.opacity = 0.05;
          ring.pillar.visible = false;
          fireBurst(ring.pos);
          hit = ring;
        }
      }
      if (burstAge < BURST_LIFE) {
        burstAge += dt;
        var fade = 1 - burstAge / BURST_LIFE;
        burstMat.opacity = fade;
        for (var j = 0; j < BURST_COUNT; j++) {
          burstPos[j * 3] += burstVel[j].x * dt;
          burstPos[j * 3 + 1] += burstVel[j].y * dt;
          burstPos[j * 3 + 2] += burstVel[j].z * dt;
          burstVel[j].multiplyScalar(1 - 1.6 * dt);
        }
        burstGeo.attributes.position.needsUpdate = true;
      } else if (burstMat.opacity !== 0) {
        burstMat.opacity = 0;
      }
      return hit;
    }

    function dispose() {
      scene.remove(group);
      scene.remove(burst);
    }

    return {
      rings: rings,
      nextRing: nextRing,
      passedCount: passedCount,
      reset: reset,
      update: update,
      dispose: dispose,
    };
  }

  EMBER.rings = { build: buildRings };
})();
