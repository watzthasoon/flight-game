// EMBERWING II — Ember Valley. The Kestrel K-9 bush plane, built from
// primitives but shaped to read as a real aircraft: a slim lathe fuselage
// that tapers to a proper tail (no bulbous rear), a high wing with struts,
// tundra gear, a spinning prop — and a real 3D cockpit: dashboard, lit
// gauges, windshield pillars and the nose ahead, so the cockpit view is a
// cockpit, not an empty HUD.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var cfg = EMBER2.config;

  function Aircraft(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.prop = null;
    this.propDisc = null;
    this.navLeft = null;
    this.navRight = null;
    this._build();
    scene.add(this.group);
  }

  Aircraft.prototype._build = function () {
    var pal = cfg.palette;
    var cream = new THREE.MeshStandardMaterial({ color: pal.liveryCream, roughness: 0.55, metalness: 0.15 });
    var ember = new THREE.MeshStandardMaterial({ color: pal.liveryEmber, roughness: 0.5, metalness: 0.2 });
    var dark = new THREE.MeshStandardMaterial({ color: pal.liveryDark, roughness: 0.6, metalness: 0.3 });
    var glass = new THREE.MeshPhongMaterial({
      color: 0x9fc4d4,
      transparent: true,
      opacity: 0.42,
      shininess: 140,
      specular: 0xffffff,
    });

    // Fuselage: a lathe profile, slim at the tail, full at the cabin, a
    // neat nose. Lathe runs along +Y; rotate it so the nose points -Z.
    var profile = [
      [0.02, 0],
      [0.16, 0.35],
      [0.30, 1.1],
      [0.46, 2.2],
      [0.60, 3.2],
      [0.66, 4.1],
      [0.62, 4.9],
      [0.55, 5.7],
      [0.50, 6.3],
      [0.30, 6.95],
      [0.06, 7.2],
    ].map(function (p) {
      return new THREE.Vector2(p[0], p[1]);
    });
    var fusGeo = new THREE.LatheGeometry(profile, 20);
    fusGeo.rotateX(-Math.PI / 2);
    fusGeo.translate(0, 0, 3.6);
    var fuselage = new THREE.Mesh(fusGeo, cream);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    this.group.add(fuselage);

    // Engine cowling: ember, over the nose, with a spinner and prop.
    // Kept low so the pilot can see over it from the cockpit.
    var cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.54, 1.1, 14), ember);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, -0.02, -3.35);
    cowl.castShadow = true;
    this.group.add(cowl);
    var spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), ember);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, -0.02, -4.05);
    this.group.add(spinner);
    this.prop = new THREE.Group();
    this.prop.position.set(0, -0.02, -3.95);
    var bladeGeo = new THREE.BoxGeometry(0.22, 2.5, 0.07);
    bladeGeo.translate(0, 1.35, 0);
    for (var b = 0; b < 2; b++) {
      var blade = new THREE.Mesh(bladeGeo, dark);
      blade.rotation.z = b * Math.PI;
      blade.castShadow = true;
      this.prop.add(blade);
    }
    this.group.add(this.prop);
    var discGeo = new THREE.CircleGeometry(2.55, 24);
    this.propDisc = new THREE.Mesh(
      discGeo,
      new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.propDisc.position.set(0, -0.02, -3.98);
    this.group.add(this.propDisc);

    // High wing: a tapered planform, extruded thin, with a little dihedral.
    // One shape, mirrored for the two halves.
    var wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.85);
    wingShape.lineTo(5.6, -0.5);
    wingShape.lineTo(5.6, 0.45);
    wingShape.lineTo(0, 0.85);
    wingShape.closePath();
    var wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false });
    wingGeo.rotateX(-Math.PI / 2);
    wingGeo.translate(0, 0, 0);
    var wingL = new THREE.Mesh(wingGeo, ember);
    wingL.position.set(0, 0.78, -0.4);
    wingL.rotation.z = 0.06;
    wingL.castShadow = true;
    this.group.add(wingL);
    var wingR = new THREE.Mesh(wingGeo, ember);
    wingR.position.set(0, 0.78, -0.4);
    wingR.rotation.z = -0.06;
    wingR.scale.x = -1;
    wingR.castShadow = true;
    this.group.add(wingR);
    // Cream wingtips.
    var tipGeo = new THREE.BoxGeometry(0.5, 0.14, 1.0);
    var tipL = new THREE.Mesh(tipGeo, cream);
    tipL.position.set(5.55, 1.12, -0.4);
    tipL.rotation.z = 0.06;
    this.group.add(tipL);
    var tipR = new THREE.Mesh(tipGeo, cream);
    tipR.position.set(-5.55, 1.12, -0.4);
    tipR.rotation.z = -0.06;
    this.group.add(tipR);
    // Wing struts: thin rods from the lower fuselage to the wing.
    var strutGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5);
    var strutMat = dark;
    var strutPositions = [
      [1.9, 0.1, -1.15, 0.5],
      [-1.9, 0.1, -1.15, -0.5],
      [1.9, 0.1, 0.35, -0.5],
      [-1.9, 0.1, 0.35, 0.5],
    ];
    for (var s = 0; s < strutPositions.length; s++) {
      var sp = strutPositions[s];
      var strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(sp[0], sp[1], sp[2]);
      strut.rotation.z = sp[3];
      this.group.add(strut);
    }
    // Nav lights: red left, green right, white tail.
    var navGeo = new THREE.SphereGeometry(0.12, 8, 6);
    this.navLeft = new THREE.Mesh(
      navGeo,
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2.5 }),
    );
    this.navLeft.position.set(5.7, 1.12, -0.4);
    this.group.add(this.navLeft);
    this.navRight = new THREE.Mesh(
      navGeo,
      new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x20ff40, emissiveIntensity: 2.5 }),
    );
    this.navRight.position.set(-5.7, 1.12, -0.4);
    this.group.add(this.navRight);
    var tailLight = new THREE.Mesh(
      navGeo,
      new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffffff, emissiveIntensity: 2 }),
    );
    tailLight.position.set(0, 0.25, 3.62);
    this.group.add(tailLight);

    // Tail: a tapered stabilizer and a fin, both slim.
    var stabShape = new THREE.Shape();
    stabShape.moveTo(0, -0.55);
    stabShape.lineTo(2.1, -0.3);
    stabShape.lineTo(2.1, 0.3);
    stabShape.lineTo(0, 0.55);
    stabShape.closePath();
    var stabGeo = new THREE.ExtrudeGeometry(stabShape, { depth: 0.09, bevelEnabled: false });
    stabGeo.rotateX(-Math.PI / 2);
    var stabL = new THREE.Mesh(stabGeo, ember);
    stabL.position.set(0, 0.32, 3.0);
    stabL.castShadow = true;
    this.group.add(stabL);
    var stabR = new THREE.Mesh(stabGeo, ember);
    stabR.position.set(0, 0.32, 3.0);
    stabR.scale.x = -1;
    stabR.castShadow = true;
    this.group.add(stabR);
    var finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(1.15, 0.18);
    finShape.lineTo(1.35, 1.35);
    finShape.lineTo(0.25, 1.5);
    finShape.closePath();
    var finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.09, bevelEnabled: false });
    var fin = new THREE.Mesh(finGeo, ember);
    fin.position.set(-0.045, 0.35, 2.35);
    fin.castShadow = true;
    this.group.add(fin);

    // Fixed gear with big tundra tires.
    var gearStrutGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.5, 5);
    var wheelGeo = new THREE.TorusGeometry(0.55, 0.24, 8, 14);
    var hubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 10);
    var wheelPositions = [
      [1.15, -1.15],
      [-1.15, -1.15],
    ];
    for (var w = 0; w < wheelPositions.length; w++) {
      var wx = wheelPositions[w][0];
      var wz = wheelPositions[w][1];
      var gear = new THREE.Mesh(gearStrutGeo, dark);
      gear.position.set(wx * 0.75, -0.9, wz);
      gear.rotation.z = wx > 0 ? 0.45 : -0.45;
      gear.castShadow = true;
      this.group.add(gear);
      var wheel = new THREE.Mesh(wheelGeo, dark);
      wheel.position.set(wx, -1.55, wz);
      wheel.castShadow = true;
      this.group.add(wheel);
      var hub = new THREE.Mesh(hubGeo, cream);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, -1.55, wz);
      this.group.add(hub);
    }
    var tailWheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.1, 6, 10), dark);
    tailWheel.position.set(0, -0.55, 3.3);
    this.group.add(tailWheel);

    // Canopy: a tinted glasshouse over the cabin.
    var canopyGeo = new THREE.SphereGeometry(0.72, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    canopyGeo.scale(1, 0.85, 1.9);
    var canopy = new THREE.Mesh(canopyGeo, glass);
    canopy.position.set(0, 0.42, -0.7);
    this.group.add(canopy);

    this._buildCockpit(cream, dark, glass);
  };

  // The cockpit interior: dashboard with lit gauges, glareshield, windshield
  // pillars and side frames, and the seat. From the pilot's seat you see
  // the panel, the pillars, and the cowling and spinner ahead — a cockpit.
  Aircraft.prototype._buildCockpit = function (cream, dark, glass) {
    var frame = new THREE.Group();
    // Glareshield: the padded brow over the panel. Slim, so it does not
    // eat the forward view.
    var shield = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.55), dark);
    shield.position.set(0, 0.52, -1.95);
    frame.add(shield);
    // Instrument panel: a dark face with six lit gauges. Low and compact.
    var panel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.45, 0.1), dark);
    panel.position.set(0, 0.25, -1.98);
    frame.add(panel);
    var gaugeGeo = new THREE.CircleGeometry(0.11, 12);
    for (var i = 0; i < 6; i++) {
      var gx = -0.55 + (i % 3) * 0.55;
      var gy = i < 3 ? 0.38 : 0.15;
      var gauge = new THREE.Mesh(
        gaugeGeo,
        new THREE.MeshStandardMaterial({
          color: 0x111111,
          emissive: i % 2 === 0 ? 0x7de3a0 : 0xffc46b,
          emissiveIntensity: 1.1,
        }),
      );
      gauge.position.set(gx, gy, -2.04);
      frame.add(gauge);
    }
    // Windshield pillars: two angled posts framing the front glass.
    var pillarGeo = new THREE.BoxGeometry(0.09, 1.05, 0.09);
    var pillarL = new THREE.Mesh(pillarGeo, dark);
    pillarL.position.set(0.68, 0.85, -1.85);
    pillarL.rotation.x = -0.28;
    pillarL.rotation.z = -0.18;
    frame.add(pillarL);
    var pillarR = new THREE.Mesh(pillarGeo, dark);
    pillarR.position.set(-0.68, 0.85, -1.85);
    pillarR.rotation.x = -0.28;
    pillarR.rotation.z = 0.18;
    frame.add(pillarR);
    // Top crossbar and side frames.
    var cross = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.09), dark);
    cross.position.set(0, 1.32, -1.95);
    frame.add(cross);
    var sideGeo = new THREE.BoxGeometry(0.08, 0.08, 1.5);
    var sideL = new THREE.Mesh(sideGeo, dark);
    sideL.position.set(0.72, 0.95, -0.9);
    frame.add(sideL);
    var sideR = new THREE.Mesh(sideGeo, dark);
    sideR.position.set(-0.72, 0.95, -0.9);
    frame.add(sideR);
    // Seat and stick.
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.5), dark);
    seat.position.set(0, 0.28, -0.15);
    frame.add(seat);
    var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.55, 6), dark);
    stick.position.set(0, 0.35, -0.85);
    stick.rotation.x = 0.25;
    frame.add(stick);
    this.group.add(frame);
    this.cockpitFrame = frame;
  };

  // Place and orient the plane. Heading 0 faces north (-Z); pitch positive
  // is nose up; roll positive is banked right.
  Aircraft.prototype.setState = function (pos, heading, pitch, roll) {
    this.group.position.copy(pos);
    this.group.rotation.order = 'YXZ';
    this.group.rotation.y = heading;
    this.group.rotation.x = pitch;
    this.group.rotation.z = -roll;
  };

  Aircraft.prototype.update = function (dt, throttle, speed) {
    var spin = 4 + throttle * 46 + speed * 0.25;
    if (this.prop) this.prop.rotation.z += spin * dt;
    if (this.propDisc) {
      this.propDisc.material.opacity = Math.min(0.16, throttle * 0.2);
      this.propDisc.rotation.z += spin * dt * 0.5;
    }
  };

  // Where the pilot's head is, in world space, for the cockpit camera.
  // High and a touch forward, so the pilot sees over the (lowered) cowling
  // and the panel sits at the bottom of the frame, not across its middle.
  Aircraft.prototype.cockpitTransform = function () {
    var local = new THREE.Vector3(0, 1.15, -0.7);
    var world = this.group.localToWorld(local.clone());
    var quat = this.group.quaternion.clone();
    return { position: world, quaternion: quat };
  };

  EMBER2.Aircraft = Aircraft;
})();
