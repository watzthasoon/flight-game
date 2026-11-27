// EMBERWING II — Ember Valley. The sky: a gradient dome that shifts with
// the time of day, a low sun with glow, drifting clouds, stars at night,
// fog, and a few soft light shafts for the dusk god-ray feel.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;
  var cfg = EMBER2.config;

  function Sky(scene) {
    this.scene = scene;
    this.timeOfDay = 'dusk';
    this.dome = null;
    this.domeMat = null;
    this.sunSprite = null;
    this.glowSprite = null;
    this.clouds = [];
    this.stars = null;
    this.shafts = [];
    this._build();
  }

  function makeGlowTexture(inner, outer) {
    var c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, inner);
    grad.addColorStop(0.35, outer);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function makeCloudTexture() {
    var c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    var g = c.getContext('2d');
    var rng = util.makeRng(4242);
    for (var i = 0; i < 26; i++) {
      var x = 30 + rng() * 196;
      var y = 40 + rng() * 48;
      var r = 16 + rng() * 30;
      var grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(255, 235, 220, 0.55)');
      grad.addColorStop(1, 'rgba(255, 235, 220, 0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return new THREE.CanvasTexture(c);
  }

  Sky.prototype._build = function () {
    var scene = this.scene;
    // Gradient dome: a big sphere, BackSide, its colour mixed by height.
    var domeGeo = new THREE.SphereGeometry(9000, 24, 14);
    this.domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(cfg.palette.skyTopDusk) },
        horizonColor: { value: new THREE.Color(cfg.palette.skyHorizonDusk) },
        sunDir: { value: new THREE.Vector3(-0.55, 0.28, 0.78).normalize() },
        sunColor: { value: new THREE.Color(0xffc27a) },
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}',
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vDir;',
        'uniform vec3 topColor;',
        'uniform vec3 horizonColor;',
        'uniform vec3 sunDir;',
        'uniform vec3 sunColor;',
        'void main() {',
        '  float h = clamp(vDir.y, -0.08, 1.0);',
        '  vec3 col = mix(horizonColor, topColor, pow(max(h, 0.0), 0.55));',
        '  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);',
        '  col += sunColor * pow(s, 90.0) * 1.4 + sunColor * pow(s, 8.0) * 0.35;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}',
      ].join('\n'),
    });
    this.dome = new THREE.Mesh(domeGeo, this.domeMat);
    scene.add(this.dome);

    // Sun disc and its halo, low in the west.
    var sunTex = makeGlowTexture('rgba(255, 240, 200, 1)', 'rgba(255, 180, 90, 0.55)');
    this.sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false }),
    );
    this.sunSprite.position.set(-4200, 1500, 5200);
    this.sunSprite.scale.set(1500, 1500, 1);
    scene.add(this.sunSprite);
    var glowTex = makeGlowTexture('rgba(255, 190, 110, 0.5)', 'rgba(255, 140, 60, 0.18)');
    this.glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }),
    );
    this.glowSprite.position.copy(this.sunSprite.position);
    this.glowSprite.scale.set(5200, 5200, 1);
    scene.add(this.glowSprite);

    // Clouds: soft billboards drifting slowly, warm-lit at dusk.
    var cloudTex = makeCloudTexture();
    var rng = util.makeRng(99);
    for (var i = 0; i < 22; i++) {
      var mat = new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.5 + rng() * 0.35,
        depthWrite: false,
        fog: false,
      });
      var cloud = new THREE.Sprite(mat);
      var a = rng() * Math.PI * 2;
      var r = 2500 + rng() * 5000;
      cloud.position.set(Math.cos(a) * r, 700 + rng() * 900, -5500 + rng() * 11000);
      cloud.scale.set(1400 + rng() * 1800, 380 + rng() * 320, 1);
      cloud.userData.drift = 6 + rng() * 10;
      scene.add(cloud);
      this.clouds.push(cloud);
    }

    // Stars for the night sortie, hidden by day.
    var starCount = 900;
    var starPos = new Float32Array(starCount * 3);
    var srng = util.makeRng(7);
    for (var s = 0; s < starCount; s++) {
      var theta = srng() * Math.PI * 2;
      var phi = Math.acos(1 - srng() * 0.85);
      var rr = 8200;
      starPos[s * 3] = rr * Math.sin(phi) * Math.cos(theta);
      starPos[s * 3 + 1] = rr * Math.cos(phi) + 300;
      starPos[s * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xdde4ff, size: 26, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }),
    );
    scene.add(this.stars);

    // Light shafts: tall translucent planes fanning from the sun's side,
    // additive, very subtle — the dusk god-ray feel without a post pass.
    var shaftMat = new THREE.MeshBasicMaterial({
      color: 0xffb36b,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    for (var k = 0; k < 4; k++) {
      var shaft = new THREE.Mesh(new THREE.PlaneGeometry(500 + k * 260, 5200), shaftMat.clone());
      shaft.material.opacity = 0.045 - k * 0.008;
      shaft.position.set(-2600 + k * 700, 2400, -5000 + k * 2400);
      shaft.rotation.set(0.12, 0.5, 0.32 + k * 0.06);
      scene.add(shaft);
      this.shafts.push(shaft);
    }
  };

  // Switch the whole sky between dusk and night.
  Sky.prototype.setTimeOfDay = function (mode, scene) {
    this.timeOfDay = mode;
    var night = mode === 'night';
    var top = night ? cfg.palette.skyTopNight : cfg.palette.skyTopDusk;
    var horizon = night ? cfg.palette.skyHorizonNight : cfg.palette.skyHorizonDusk;
    this.domeMat.uniforms.topColor.value.setHex(top);
    this.domeMat.uniforms.horizonColor.value.setHex(horizon);
    this.sunSprite.material.opacity = night ? 0.12 : 1;
    this.glowSprite.material.opacity = night ? 0.1 : 1;
    this.stars.material.opacity = night ? 0.9 : 0;
    for (var i = 0; i < this.shafts.length; i++) {
      this.shafts[i].visible = !night;
    }
    var fogColor = night ? cfg.palette.fogNight : cfg.palette.fogDusk;
    scene.fog = new THREE.Fog(fogColor, 900, 7800);
    scene.background = new THREE.Color(fogColor);
  };

  Sky.prototype.update = function (dt) {
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      c.position.x += c.userData.drift * dt;
      if (c.position.x > 8000) c.position.x = -8000;
    }
  };

  EMBER2.Sky = Sky;
})();
