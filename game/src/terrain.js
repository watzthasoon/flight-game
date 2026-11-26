// EMBERWING — Canyon Courier. The canyon itself: one height function shared
// by the mesh, the river, the rings and the flight model, so the ground the
// plane can hit is exactly the ground the player sees. A dusk sky dome, a low
// sun, drifting clouds, two lit airstrips and a winding river complete it.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var cfg = EMBER.config.canyon;
  var palette = EMBER.config.palette;
  var util = EMBER.util;
  var noise = util.makeNoise2D(cfg.seed);

  // The river winds down the valley floor; the rings follow it.
  function riverX(z) {
    return 200 * Math.sin(z * 0.00035) + 90 * Math.sin(z * 0.0011 + 1.7);
  }

  function flattenForStrip(h, x, z, strip) {
    var dx = Math.max(0, Math.abs(x - strip.x) - (strip.width / 2 + 20));
    var dz = Math.max(0, Math.abs(z - strip.z) - (strip.length / 2 + 20));
    var dist = Math.sqrt(dx * dx + dz * dz);
    var t = util.smoothstep(130, 0, dist);
    return util.lerp(h, 0, t);
  }

  // The one true ground height. Everything that touches the ground uses this.
  function groundHeight(x, z) {
    var rx = riverX(z);
    var d = Math.abs(x - rx);
    var floor = 4 + 6 * noise.fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.1, 3);
    var wallT = util.smoothstep(cfg.wallStart, cfg.wallTop, d);
    var wall = wallT * cfg.wallHeight;
    var plateau = 0;
    if (d > cfg.wallTop) {
      plateau = 70 * noise.fbm(x * 0.0011 + 3.1, z * 0.0011 + 8.4, 3);
    }
    var h = floor + wall + plateau * wallT;
    // Riverbed: flat and low near the water.
    var riverT = util.smoothstep(150, 60, d);
    h = util.lerp(h, 1.5, riverT * 0.9);
    // Airstrips: flat pads carved into the floor.
    h = flattenForStrip(h, x, z, EMBER.config.strips.start);
    h = flattenForStrip(h, x, z, EMBER.config.strips.dest);
    return h;
  }

  // Is the point over a runway? Returns the strip and offsets, or null.
  function onStrip(x, z) {
    var strips = EMBER.config.strips;
    var names = ['start', 'dest'];
    for (var i = 0; i < names.length; i++) {
      var s = strips[names[i]];
      if (Math.abs(x - s.x) <= s.width / 2 && Math.abs(z - s.z) <= s.length / 2) {
        return { name: names[i], strip: s, lateral: x - s.x, along: z - s.z };
      }
    }
    return null;
  }

  function makeCanvas(w, h) {
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  function runwayTexture() {
    var canvas = makeCanvas(128, 1024);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2e2c33';
    ctx.fillRect(0, 0, 128, 1024);
    var rand = util.mulberry32(99);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (var i = 0; i < 900; i++) {
      ctx.fillRect(rand() * 128, rand() * 1024, 2, 2);
    }
    // Edge lines.
    ctx.fillStyle = '#e8e4da';
    ctx.fillRect(5, 0, 3, 1024);
    ctx.fillRect(120, 0, 3, 1024);
    // Centreline dashes.
    for (var y = 40; y < 1024; y += 86) {
      ctx.fillRect(62, y, 4, 44);
    }
    // Threshold bars at both ends.
    for (var b = 0; b < 6; b++) {
      ctx.fillRect(14 + b * 18, 18, 10, 46);
      ctx.fillRect(14 + b * 18, 960, 10, 46);
    }
    // Runway numbers.
    ctx.fillStyle = '#e8e4da';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('27', 64, 140);
    ctx.save();
    ctx.translate(64, 1024 - 84);
    ctx.rotate(Math.PI);
    ctx.fillText('09', 0, 0);
    ctx.restore();
    var tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  function riverTexture() {
    var canvas = makeCanvas(128, 128);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2e6b7a';
    ctx.fillRect(0, 0, 128, 128);
    var rand = util.mulberry32(7);
    for (var i = 0; i < 46; i++) {
      ctx.strokeStyle = 'rgba(190,230,240,' + (0.08 + rand() * 0.16) + ')';
      ctx.lineWidth = 1 + rand() * 2;
      var y = rand() * 128;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(40, y + rand() * 8 - 4, 88, y + rand() * 8 - 4, 128, y);
      ctx.stroke();
    }
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 48);
    return tex;
  }

  function glowTexture() {
    var canvas = makeCanvas(128, 128);
    var ctx = canvas.getContext('2d');
    var grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,217,160,1)');
    grad.addColorStop(0.35, 'rgba(255,160,80,0.55)');
    grad.addColorStop(1, 'rgba(255,140,66,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }

  function buildSky(scene, timeOfDay) {
    var night = timeOfDay === 'night';
    var top = new THREE.Color(night ? palette.skyTopNight : palette.skyTopDusk);
    var horizon = new THREE.Color(night ? palette.skyHorizonNight : palette.skyHorizonDusk);
    var ground = new THREE.Color(night ? 0x0c0a18 : 0x4a2a20);
    var geo = new THREE.SphereGeometry(9000, 28, 18);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: top },
        horizonColor: { value: horizon },
        groundColor: { value: ground },
      },
      vertexShader: [
        'varying vec3 vPos;',
        'void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor;',
        'varying vec3 vPos;',
        'void main() {',
        '  float h = normalize(vPos).y;',
        '  vec3 col = h >= 0.0',
        '    ? mix(horizonColor, topColor, pow(h, 0.55))',
        '    : mix(horizonColor, groundColor, clamp(-h * 4.0, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
    var sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    scene.add(sky);

    // The low sun, west of the canyon, and its glow.
    var sunPos = new THREE.Vector3(-4200, 1050, -6800);
    var sun = new THREE.Mesh(
      new THREE.CircleGeometry(300, 32),
      new THREE.MeshBasicMaterial({ color: palette.sun, fog: false }),
    );
    sun.position.copy(sunPos);
    sun.lookAt(0, 400, -5500);
    scene.add(sun);
    var glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture(),
        transparent: true,
        opacity: night ? 0.35 : 0.85,
        depthWrite: false,
        fog: false,
      }),
    );
    glow.position.copy(sunPos);
    glow.scale.set(2600, 2600, 1);
    scene.add(glow);

    // Stars, only really visible after dark.
    var starCount = 700;
    var positions = new Float32Array(starCount * 3);
    var rand = util.mulberry32(4242);
    for (var i = 0; i < starCount; i++) {
      var theta = rand() * Math.PI * 2;
      var phi = Math.acos(rand() * 0.85);
      var r = 8600;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 400;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 5500;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 2.4,
        sizeAttenuation: false,
        transparent: true,
        opacity: night ? 0.9 : 0.0,
        fog: false,
        depthWrite: false,
      }),
    );
    scene.add(stars);
    return { sunPos: sunPos, stars: stars };
  }

  function buildTerrainMesh(scene) {
    var width = cfg.halfWidth * 2;
    var depth = cfg.zNear - cfg.zFar;
    var zCentre = (cfg.zNear + cfg.zFar) / 2;
    var segX = 190;
    var segZ = 250;
    var geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var z = pos.getZ(i) + zCentre;
      pos.setY(i, groundHeight(x, z));
      pos.setZ(i, z);
    }
    geo.computeVertexNormals();
    // Vertex colours: sand floor, rust rock on the heights and steeps,
    // dark scrub where the noise says so, wet dark sand by the river.
    var colors = new Float32Array(pos.count * 3);
    var sand = new THREE.Color(palette.sand);
    var rock = new THREE.Color(palette.rock);
    var scrub = new THREE.Color(palette.scrub);
    var tmp = new THREE.Color();
    var normals = geo.attributes.normal;
    for (var v = 0; v < pos.count; v++) {
      var vx = pos.getX(v);
      var vz = pos.getZ(v);
      var h = pos.getY(v);
      var slope = normals.getY(v);
      var n = noise.fbm(vx * 0.004 + 11, vz * 0.004 + 5, 3);
      tmp.copy(sand);
      var rockT = util.smoothstep(120, 320, h) * 0.8 + util.smoothstep(0.86, 0.6, slope) * 0.7;
      tmp.lerp(rock, util.clamp(rockT, 0, 1));
      if (n > 0.62 && h > 30 && h < 320 && slope > 0.85) {
        tmp.lerp(scrub, 0.65);
      }
      var riverD = Math.abs(vx - riverX(vz));
      if (riverD < 150) tmp.multiplyScalar(0.72);
      tmp.multiplyScalar(0.88 + n * 0.24);
      colors[v * 3] = tmp.r;
      colors[v * 3 + 1] = tmp.g;
      colors[v * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    mesh.position.z = 0;
    scene.add(mesh);
  }

  function buildRiver(scene) {
    var tex = riverTexture();
    var samples = [];
    for (var z = 1050; z >= -12050; z -= 75) {
      samples.push(z);
    }
    var count = samples.length;
    var positions = new Float32Array(count * 2 * 3);
    var uvs = new Float32Array(count * 2 * 2);
    var indices = [];
    for (var i = 0; i < count; i++) {
      var zz = samples[i];
      var cx = riverX(zz);
      var y = groundHeight(cx, zz) + 1.1;
      positions.set([cx - 34, y, zz, cx + 34, y, zz], i * 6);
      uvs.set([0, i / 8, 1, i / 8], i * 4);
      if (i < count - 1) {
        var a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({
        color: palette.river,
        map: tex,
        transparent: true,
        opacity: 0.88,
        shininess: 90,
      }),
    );
    scene.add(mesh);
    return tex;
  }

  function buildStrip(scene, strip, withBuildings) {
    var group = new THREE.Group();
    var tex = runwayTexture();
    var surface = new THREE.Mesh(
      new THREE.PlaneGeometry(strip.width, strip.length),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(strip.x, 0.35, strip.z);
    group.add(surface);
    // Edge lights and green threshold lights.
    var lightGeo = new THREE.SphereGeometry(1.1, 8, 6);
    var edgeMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    var greenMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a });
    for (var d = -strip.length / 2 + 20; d <= strip.length / 2 - 20; d += 60) {
      var left = new THREE.Mesh(lightGeo, edgeMat);
      left.position.set(strip.x - strip.width / 2 - 3, 1.2, strip.z + d);
      group.add(left);
      var right = new THREE.Mesh(lightGeo, edgeMat);
      right.position.set(strip.x + strip.width / 2 + 3, 1.2, strip.z + d);
      group.add(right);
    }
    [-1, 1].forEach(function (side) {
      var g = new THREE.Mesh(lightGeo, greenMat);
      g.position.set(strip.x + side * (strip.width / 2 - 4), 1.2, strip.z - strip.length / 2 + 4);
      group.add(g);
    });
    // Windsock: a pole and a striped cone that points downwind.
    var sock = new THREE.Group();
    var pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 9, 8),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }),
    );
    pole.position.y = 4.5;
    sock.add(pole);
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 4.2, 10),
      new THREE.MeshLambertMaterial({ color: 0xff7b00 }),
    );
    cone.rotation.z = Math.PI / 2;
    cone.position.set(2.1, 8.6, 0);
    sock.add(cone);
    sock.position.set(strip.x + strip.width / 2 + 26, 0, strip.z + strip.length / 2 - 40);
    group.add(sock);

    if (withBuildings) {
      // Two Quonset hangars and a little tower beside the destination strip.
      var hutMat = new THREE.MeshLambertMaterial({ color: 0x8a7a68 });
      var hutRoofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3c });
      [[-58, 120], [-58, 165]].forEach(function (spot) {
        var hut = new THREE.Group();
        var base = new THREE.Mesh(new THREE.BoxGeometry(22, 7, 16), hutMat);
        base.position.y = 3.5;
        hut.add(base);
        var roof = new THREE.Mesh(
          new THREE.CylinderGeometry(8, 8, 22, 12, 1, false, 0, Math.PI),
          hutRoofMat,
        );
        roof.rotation.z = Math.PI / 2;
        roof.rotation.y = Math.PI / 2;
        roof.position.y = 7;
        hut.add(roof);
        hut.position.set(strip.x + spot[0], 0, strip.z + spot[1]);
        group.add(hut);
      });
      var tower = new THREE.Group();
      var shaft = new THREE.Mesh(
        new THREE.BoxGeometry(7, 22, 7),
        new THREE.MeshLambertMaterial({ color: 0x9a8a76 }),
      );
      shaft.position.y = 11;
      tower.add(shaft);
      var cab = new THREE.Mesh(
        new THREE.BoxGeometry(11, 5, 11),
        new THREE.MeshLambertMaterial({ color: 0x2e6b7a }),
      );
      cab.position.y = 24;
      tower.add(cab);
      tower.position.set(strip.x + 58, 0, strip.z + 140);
      group.add(tower);
    }
    scene.add(group);
    return { group: group, sock: sock, cone: cone };
  }

  function buildClouds(scene, timeOfDay) {
    var night = timeOfDay === 'night';
    var clouds = [];
    var rand = util.mulberry32(cfg.seed + 77);
    var mat = new THREE.MeshLambertMaterial({
      color: night ? 0x5a4a72 : 0xffd9c0,
      transparent: true,
      opacity: night ? 0.55 : 0.85,
      flatShading: true,
    });
    for (var i = 0; i < 15; i++) {
      var cloud = new THREE.Group();
      var puffs = 3 + Math.floor(rand() * 4);
      for (var p = 0; p < puffs; p++) {
        var r = 42 + rand() * 55;
        var puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
        puff.position.set((rand() - 0.5) * 220, (rand() - 0.5) * 24, (rand() - 0.5) * 120);
        puff.scale.y = 0.42;
        cloud.add(puff);
      }
      cloud.position.set(
        (rand() - 0.5) * 5600,
        720 + rand() * 380,
        1000 - rand() * 13000,
      );
      scene.add(cloud);
      clouds.push(cloud);
    }
    return clouds;
  }

  // Build the whole world for one sortie. Returns an update hook.
  function build(scene, sortie) {
    var night = sortie.timeOfDay === 'night';
    var fogColor = night ? palette.fogNight : palette.fogDusk;
    scene.fog = new THREE.Fog(fogColor, 900, 9500);
    scene.background = new THREE.Color(fogColor);

    var sunDir = new THREE.Vector3(-0.55, 0.28, -0.79).normalize();
    var sun = new THREE.DirectionalLight(night ? 0x8a9ad8 : 0xffb070, night ? 0.5 : 1.15);
    sun.position.copy(sunDir).multiplyScalar(6000);
    scene.add(sun);
    var hemi = new THREE.HemisphereLight(
      night ? 0x2a2a55 : 0x8a7bd8,
      night ? 0x1a1420 : 0x3a2a22,
      night ? 0.5 : 0.65,
    );
    scene.add(hemi);

    buildSky(scene, sortie.timeOfDay);
    buildTerrainMesh(scene);
    var waterTex = buildRiver(scene);
    var startStrip = buildStrip(scene, EMBER.config.strips.start, false);
    var destStrip = buildStrip(scene, EMBER.config.strips.dest, true);
    var clouds = buildClouds(scene, sortie.timeOfDay);

    var windAngle = 0;
    function update(dt, elapsed, wind) {
      // Water drifts downstream; clouds drift with the wind; windsocks point downwind.
      waterTex.offset.y = (elapsed * 0.02) % 1;
      for (var i = 0; i < clouds.length; i++) {
        var cloud = clouds[i];
        cloud.position.x += (2 + wind * 0.4) * dt;
        if (cloud.position.x > 3200) cloud.position.x = -3200;
      }
      windAngle = Math.atan2(wind, 8) + Math.sin(elapsed * 0.9) * 0.06;
      var sockAngle = windAngle + Math.PI / 2;
      startStrip.sock.rotation.y = sockAngle;
      destStrip.sock.rotation.y = sockAngle;
      startStrip.cone.rotation.x = Math.sin(elapsed * 2.1) * 0.08;
      destStrip.cone.rotation.x = Math.sin(elapsed * 2.1 + 1.3) * 0.08;
    }

    // Free the scene's GPU resources when a sortie rebuilds the world.
    function dispose() {
      scene.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (mat) {
            if (mat.map) mat.map.dispose();
            mat.dispose();
          });
        }
      });
    }

    return { update: update, dispose: dispose };
  }

  EMBER.terrain = {
    riverX: riverX,
    groundHeight: groundHeight,
    onStrip: onStrip,
    build: build,
  };
})();
