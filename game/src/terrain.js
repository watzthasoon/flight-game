// EMBERWING II — Ember Valley. The valley itself: a heightfield canyon with
// layered rock strata, a winding river, pine trees and boulders, and the two
// airstrips — the home strip and the far strip with its control tower.
// heightAt is the single source of truth: the mesh, the physics and the
// rings all ask it, so the ground you see is the ground you fly over.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;
  var cfg = EMBER2.config;
  var V = cfg.valley;
  var RIV = cfg.river;

  // The river's centreline: a gentle meander down the valley.
  function riverX(z) {
    return RIV.amp1 * Math.sin(z * RIV.freq1) + RIV.amp2 * Math.sin(z * RIV.freq2);
  }

  // Flatten the ground near a strip so the runway is truly flat.
  function stripBlend(x, z) {
    var best = 0;
    var strips = [cfg.strips.home, cfg.strips.far];
    for (var i = 0; i < strips.length; i++) {
      var s = strips[i];
      var dx = x - s.x;
      var dz = z - s.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      var b = 1 - util.smoothstep(240, 520, dist);
      if (b > best) best = b;
    }
    return best;
  }

  // Ground height in metres. Valley floor near the river, walls rising to
  // the crests, rolling plateau beyond, a shallow channel under the river.
  function heightAt(x, z) {
    var rx = riverX(z);
    var d = Math.abs(x - rx);
    var wall = util.smoothstep(V.floorHalf, V.wallTop, d);
    var base = wall * wall * V.wallHeight;
    var plateau = util.smoothstep(V.wallTop, 2200, d) * (V.plateauHeight - V.wallHeight);
    var rugged = (util.fbm(x, z, V.seed, 260) - 0.47) * (6 + wall * 160);
    var channel = -3.5 * (1 - util.smoothstep(0, 45, Math.abs(x - rx)));
    var h = base + plateau + rugged + channel;
    var flat = stripBlend(x, z);
    return h * (1 - flat);
  }

  // A canvas texture for the river: deep blue-green with pale streaks that
  // read as sun glint when the texture scrolls.
  function makeRiverTexture() {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    var g = c.getContext('2d');
    g.fillStyle = '#2e6b7a';
    g.fillRect(0, 0, 128, 256);
    var rng = util.makeRng(77);
    for (var i = 0; i < 90; i++) {
      var y = rng() * 256;
      var len = 20 + rng() * 70;
      var x = rng() * 128;
      g.strokeStyle = rng() > 0.5 ? 'rgba(255, 220, 160, 0.35)' : 'rgba(180, 230, 235, 0.25)';
      g.lineWidth = 1 + rng() * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rng() - 0.5) * 12, y + len);
      g.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 40);
    return tex;
  }

  // A canvas texture for a runway: dark asphalt, white edges, centreline
  // dashes, threshold bars and a big number at each end.
  function makeRunwayTexture(number) {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 1024;
    var g = c.getContext('2d');
    g.fillStyle = '#2e2c33';
    g.fillRect(0, 0, 128, 1024);
    // Wear and patch variation.
    var rng = util.makeRng(31);
    for (var i = 0; i < 260; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (rng() * 0.03) + ')';
      g.fillRect(rng() * 128, rng() * 1024, 2 + rng() * 8, 2 + rng() * 8);
    }
    g.fillStyle = '#e8e4da';
    // Edge lines.
    g.fillRect(6, 0, 4, 1024);
    g.fillRect(118, 0, 4, 1024);
    // Centreline dashes.
    for (var y = 30; y < 1024; y += 64) g.fillRect(62, y, 4, 34);
    // Threshold bars at both ends.
    for (var t = 0; t < 2; t++) {
      var y0 = t === 0 ? 18 : 1024 - 18 - 26;
      for (var b = 0; b < 4; b++) g.fillRect(18 + b * 26, y0, 16, 26);
    }
    // Runway numbers.
    g.fillStyle = '#e8e4da';
    g.font = 'bold 92px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.save();
    g.translate(64, 120);
    g.fillText(number, 0, 0);
    g.restore();
    g.save();
    g.translate(64, 1024 - 120);
    g.rotate(Math.PI);
    g.fillText(number, 0, 0);
    g.restore();
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  function Terrain(scene) {
    this.scene = scene;
    this.riverTex = null;
    this.riverMesh = null;
    this.windsock = null;
    this.windsockCone = null;
    this.towerBeacon = null;
    this.sunLight = null;
    this._build();
  }

  Terrain.prototype._build = function () {
    var scene = this.scene;
    this._buildGround(scene);
    this._buildRiver(scene);
    this._buildTrees(scene);
    this._buildRocks(scene);
    this._buildStrips(scene);
    this._buildTower(scene);
    this._buildLights(scene);
  };

  // The heightfield, coloured by height and slope into visible strata.
  Terrain.prototype._buildGround = function (scene) {
    var segX = 110;
    var segZ = 260;
    var geo = new THREE.PlaneGeometry(V.halfWidth * 2, V.zNear - V.zFar, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var cSand = new THREE.Color(0xc98f5f);
    var cGrass = new THREE.Color(0x55603c);
    var cRockA = new THREE.Color(0x8a5240);
    var cRockB = new THREE.Color(0x6e4034);
    var cRockC = new THREE.Color(0x9a6a4a);
    var cScree = new THREE.Color(0x7a6a55);
    var tmp = new THREE.Color();
    var zMid = (V.zNear + V.zFar) / 2;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i) + zMid;
      var h = heightAt(x, z);
      pos.setY(i, h);
      pos.setZ(i, z);
      // Slope from a finite difference, for bare rock on steep ground.
      var hx = heightAt(x + 24, z) - heightAt(x - 24, z);
      var hz = heightAt(x, z + 24) - heightAt(x, z - 24);
      var slope = Math.sqrt(hx * hx + hz * hz) / 48;
      var n = util.fbm(x, z, V.seed + 5, 180);
      if (h < 6) {
        tmp.copy(cSand).lerp(cGrass, util.clamp(n * 1.2, 0, 1));
        if (Math.abs(x - riverX(z)) < 60) tmp.lerp(cSand, 0.6);
      } else if (h < 320) {
        // Strata bands: alternate warm rock by height, softened by noise.
        var band = Math.floor(h / 26 + n * 0.8) % 2;
        tmp.copy(band === 0 ? cRockA : cRockB).lerp(cRockC, n * 0.5);
        if (slope > 0.55) tmp.lerp(cRockB, 0.5);
      } else if (h < 520) {
        tmp.copy(cRockC).lerp(cScree, util.clamp(n, 0, 1));
        if (slope > 0.6) tmp.copy(cRockB);
      } else {
        tmp.copy(cScree).lerp(cGrass, util.clamp(n * 0.9, 0, 0.7));
      }
      // A touch of variation so the bands never read as flat paint.
      var v = 0.92 + n * 0.16;
      colors[i * 3] = tmp.r * v;
      colors[i * 3 + 1] = tmp.g * v;
      colors[i * 3 + 2] = tmp.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.position.z = 0;
    scene.add(mesh);
    this.groundMesh = mesh;
  };

  // The river: a ribbon following the meander, its texture scrolling so the
  // water reads as moving and the sun glints on it.
  Terrain.prototype._buildRiver = function (scene) {
    var z0 = V.zNear;
    var z1 = V.zFar;
    var steps = 220;
    var positions = [];
    var uvs = [];
    var indices = [];
    for (var i = 0; i <= steps; i++) {
      var z = z0 + ((z1 - z0) * i) / steps;
      var rx = riverX(z);
      var w = RIV.width / 2;
      positions.push(rx - w, -0.5, z, rx + w, -0.5, z);
      uvs.push(0, i / 8, 1, i / 8);
      if (i < steps) {
        var a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.riverTex = makeRiverTexture();
    var mat = new THREE.MeshPhongMaterial({
      map: this.riverTex,
      color: 0x9fd4dd,
      specular: 0xffd9a0,
      shininess: 90,
      transparent: true,
      opacity: 0.92,
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.riverMesh = mesh;
  };

  // Pines on the valley floor edges and lower slopes, instanced so 350 of
  // them cost almost nothing. Never on a strip or in the river.
  Terrain.prototype._buildTrees = function (scene) {
    var rng = util.makeRng(V.seed + 11);
    var trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5);
    var canopyGeo = new THREE.ConeGeometry(2.6, 9, 6);
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
    var canopyMat = new THREE.MeshStandardMaterial({ color: 0x2e4a26, roughness: 1 });
    var count = 340;
    var trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    var canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    trunks.castShadow = true;
    canopies.castShadow = true;
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var s = new THREE.Vector3();
    var p = new THREE.Vector3();
    var placed = 0;
    var guard = 0;
    while (placed < count && guard++ < 6000) {
      var x = (rng() * 2 - 1) * 2100;
      var z = V.zFar + rng() * (V.zNear - V.zFar);
      var rx = riverX(z);
      var d = Math.abs(x - rx);
      if (d < 60 || d > 1050) continue;
      if (stripBlend(x, z) > 0.05) continue;
      var h = heightAt(x, z);
      if (h > 320) continue;
      var scale = 0.7 + rng() * 1.1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      s.set(scale, scale * (0.9 + rng() * 0.3), scale);
      p.set(x, h + 1.4 * scale, z);
      m.compose(p, q, s);
      trunks.setMatrixAt(placed, m);
      p.set(x, h + (3.2 + 4.2) * scale, z);
      m.compose(p, q, s);
      canopies.setMatrixAt(placed, m);
      placed++;
    }
    trunks.count = placed;
    canopies.count = placed;
    scene.add(trunks);
    scene.add(canopies);
  };

  // Boulders on the slopes and along the riverbanks, instanced.
  Terrain.prototype._buildRocks = function (scene) {
    var rng = util.makeRng(V.seed + 23);
    var geo = new THREE.DodecahedronGeometry(1.6, 0);
    var mat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1 });
    var count = 230;
    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var e = new THREE.Euler();
    var s = new THREE.Vector3();
    var p = new THREE.Vector3();
    var placed = 0;
    var guard = 0;
    while (placed < count && guard++ < 5000) {
      var x = (rng() * 2 - 1) * 2300;
      var z = V.zFar + rng() * (V.zNear - V.zFar);
      var rx = riverX(z);
      var d = Math.abs(x - rx);
      if (d < 46) continue;
      if (stripBlend(x, z) > 0.05) continue;
      var h = heightAt(x, z);
      var sc = 0.5 + rng() * 2.6;
      e.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
      q.setFromEuler(e);
      s.set(sc, sc * (0.6 + rng() * 0.5), sc);
      p.set(x, h + 0.4 * sc, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(placed, m);
      placed++;
    }
    mesh.count = placed;
    scene.add(mesh);
  };

  // One runway: textured surface, edge lights, PAPI, plus a windsock and a
  // hangar at home. The far strip gets the tower (built separately).
  Terrain.prototype._buildStrips = function (scene) {
    var strips = [cfg.strips.home, cfg.strips.far];
    for (var i = 0; i < strips.length; i++) {
      this._buildRunway(scene, strips[i], i === 0 ? '09' : '27');
    }
    this._buildWindsock(scene, cfg.strips.home.x + 60, cfg.strips.home.z + 180);
    this._buildHangar(scene, cfg.strips.home.x - 90, cfg.strips.home.z + 150);
  };

  Terrain.prototype._buildRunway = function (scene, strip, number) {
    var tex = makeRunwayTexture(number);
    var geo = new THREE.PlaneGeometry(strip.width, strip.length);
    geo.rotateX(-Math.PI / 2);
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(strip.x, 0.3, strip.z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    // Edge lights: warm points down both sides, instanced.
    var lightGeo = new THREE.SphereGeometry(0.55, 6, 5);
    var lightMat = new THREE.MeshStandardMaterial({
      color: 0x332211,
      emissive: 0xffc46b,
      emissiveIntensity: 1.6,
    });
    var n = Math.floor(strip.length / 55);
    var lights = new THREE.InstancedMesh(lightGeo, lightMat, n * 2);
    var m = new THREE.Matrix4();
    var idx = 0;
    for (var k = 0; k < n; k++) {
      var z = strip.z - strip.length / 2 + (k + 0.5) * (strip.length / n);
      m.makeTranslation(strip.x - strip.width / 2 - 3, 0.8, z);
      lights.setMatrixAt(idx++, m);
      m.makeTranslation(strip.x + strip.width / 2 + 3, 0.8, z);
      lights.setMatrixAt(idx++, m);
    }
    lights.count = idx;
    scene.add(lights);
    // PAPI: four lights beside the threshold, two red two white.
    var papiGeo = new THREE.BoxGeometry(1.6, 0.9, 1.2);
    for (var j = 0; j < 4; j++) {
      var red = j < 2;
      var papiMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        emissive: red ? 0xff2a1a : 0xfff2cc,
        emissiveIntensity: 2.2,
      });
      var papi = new THREE.Mesh(papiGeo, papiMat);
      papi.position.set(strip.x + strip.width / 2 + 14 + j * 5, 0.9, strip.z + strip.length / 2 - 90);
      scene.add(papi);
    }
  };

  Terrain.prototype._buildWindsock = function (scene, x, z) {
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 11, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }),
    );
    pole.position.set(x, heightAt(x, z) + 5.5, z);
    pole.castShadow = true;
    scene.add(pole);
    var coneGeo = new THREE.ConeGeometry(1.1, 4.2, 8, 1, true);
    coneGeo.rotateZ(-Math.PI / 2);
    coneGeo.translate(2.1, 0, 0);
    var coneMat = new THREE.MeshStandardMaterial({
      color: 0xff7b24,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    var cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, heightAt(x, z) + 10.6, z);
    cone.castShadow = true;
    scene.add(cone);
    this.windsock = new THREE.Group();
    this.windsock.position.set(x, heightAt(x, z) + 10.6, z);
    this.windsock.add(cone);
    cone.position.set(0, 0, 0);
    scene.add(this.windsock);
    this.windsockCone = cone;
  };

  Terrain.prototype._buildHangar = function (scene, x, z) {
    var y = heightAt(x, z);
    var group = new THREE.Group();
    var walls = new THREE.Mesh(
      new THREE.BoxGeometry(26, 9, 18),
      new THREE.MeshStandardMaterial({ color: 0x9a8f7a, roughness: 0.9 }),
    );
    walls.position.y = 4.5;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
    var roof = new THREE.Mesh(
      new THREE.CylinderGeometry(9.2, 9.2, 26, 12, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x6e5a44, roughness: 0.9 }),
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = 9;
    roof.castShadow = true;
    group.add(roof);
    var door = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 7.5),
      new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.7, metalness: 0.4 }),
    );
    door.position.set(0, 3.75, 9.05);
    group.add(door);
    group.position.set(x, y, z);
    scene.add(group);
  };

  // The control tower at the far strip: a concrete shaft, and a real glass
  // cab — transparent panes framed by mullions, a lit console inside, a roof
  // slab, an antenna mast and a blinking red beacon. No blue slab.
  Terrain.prototype._buildTower = function (scene) {
    var strip = cfg.strips.far;
    var x = strip.x + 70;
    var z = strip.z + 120;
    var y = heightAt(x, z);
    var group = new THREE.Group();
    var concrete = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.95 });
    var shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 26, 8), concrete);
    shaft.position.y = 13;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);
    var skirt = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.8, 3, 8), concrete);
    skirt.position.y = 27.2;
    skirt.castShadow = true;
    group.add(skirt);
    // Glass cab: transparent panes, dark mullion frame, lit interior.
    var cabW = 11;
    var cabH = 4.6;
    var cabY = 31;
    var glassMat = new THREE.MeshPhongMaterial({
      color: 0xbfd9e2,
      transparent: true,
      opacity: 0.32,
      shininess: 120,
      specular: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    var cab = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH, cabW), glassMat);
    cab.position.y = cabY;
    group.add(cab);
    var frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 });
    // Corner posts and a mid rail on each face.
    var postGeo = new THREE.BoxGeometry(0.5, cabH, 0.5);
    var railGeoH = new THREE.BoxGeometry(cabW + 0.4, 0.5, 0.5);
    var railGeoD = new THREE.BoxGeometry(0.5, 0.5, cabW + 0.4);
    var hx = cabW / 2;
    var corners = [
      [-hx, -hx],
      [hx, -hx],
      [-hx, hx],
      [hx, hx],
    ];
    for (var i = 0; i < corners.length; i++) {
      var post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(corners[i][0], cabY, corners[i][1]);
      group.add(post);
    }
    var rails = [
      { geo: railGeoH, x: 0, z: -hx },
      { geo: railGeoH, x: 0, z: hx },
      { geo: railGeoD, x: -hx, z: 0 },
      { geo: railGeoD, x: hx, z: 0 },
    ];
    for (var r = 0; r < rails.length; r++) {
      var top = new THREE.Mesh(rails[r].geo, frameMat);
      top.position.set(rails[r].x, cabY + cabH / 2, rails[r].z);
      group.add(top);
      var bottom = new THREE.Mesh(rails[r].geo, frameMat);
      bottom.position.set(rails[r].x, cabY - cabH / 2, rails[r].z);
      group.add(bottom);
    }
    // Interior: a warm console and a desk glow, seen through the glass.
    var consoleMat = new THREE.MeshStandardMaterial({
      color: 0x1c1a18,
      emissive: 0xff9a3c,
      emissiveIntensity: 0.9,
    });
    var consoleMesh = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 2.2), consoleMat);
    consoleMesh.position.set(0, cabY - 1.2, -2.4);
    group.add(consoleMesh);
    var deskGlow = new THREE.Mesh(
      new THREE.BoxGeometry(7, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x201a14, emissive: 0xffc46b, emissiveIntensity: 0.35 }),
    );
    deskGlow.position.set(0, cabY - 1.9, 0);
    group.add(deskGlow);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(cabW + 1.6, 0.7, cabW + 1.6), frameMat);
    roof.position.y = cabY + cabH / 2 + 0.35;
    roof.castShadow = true;
    group.add(roof);
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 7, 5), frameMat);
    mast.position.y = cabY + cabH / 2 + 4;
    group.add(mast);
    var beaconMat = new THREE.MeshStandardMaterial({
      color: 0x330000,
      emissive: 0xff2211,
      emissiveIntensity: 3,
    });
    var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), beaconMat);
    beacon.position.y = cabY + cabH / 2 + 7.6;
    group.add(beacon);
    this.towerBeacon = beaconMat;
    group.position.set(x, y, z);
    scene.add(group);
  };

  // Sun (directional, shadow-casting) and sky fill. The shadow camera is
  // small and follows the plane, so shadows stay crisp where you fly.
  Terrain.prototype._buildLights = function (scene) {
    var sun = new THREE.DirectionalLight(0xffb36b, 2.4);
    sun.position.set(-260, 190, 320);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -280;
    sc.right = 280;
    sc.top = 280;
    sc.bottom = -280;
    sc.near = 1;
    sc.far = 1400;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sunLight = sun;
    var hemi = new THREE.HemisphereLight(0x8a6fb0, 0x4a3428, 0.85);
    scene.add(hemi);
    this.hemiLight = hemi;
  };

  // Per-frame: scroll the river, swing the windsock, blink the beacon, and
  // keep the sun's shadow camera centred on the plane.
  Terrain.prototype.update = function (dt, time, planePos, windHeading, windSpeed) {
    if (this.riverTex) this.riverTex.offset.y -= dt * 0.045;
    if (this.windsock) {
      this.windsock.rotation.y = windHeading - Math.PI / 2;
      // The sock hangs when the air is still and streams out as wind rises.
      var droop = (1 - util.clamp(windSpeed / 14, 0, 1)) * 1.1;
      this.windsockCone.rotation.z = -droop;
    }
    if (this.towerBeacon) {
      var on = Math.sin(time * 2.4) > 0.2;
      this.towerBeacon.emissiveIntensity = on ? 3 : 0.15;
    }
    if (this.sunLight && planePos) {
      var s = this.sunLight;
      s.position.set(planePos.x - 260, planePos.y + 190, planePos.z + 320);
      s.target.position.copy(planePos);
      s.target.updateMatrixWorld();
    }
  };

  EMBER2.terrain = {
    riverX: riverX,
    heightAt: heightAt,
    stripBlend: stripBlend,
    Terrain: Terrain,
  };
})();
