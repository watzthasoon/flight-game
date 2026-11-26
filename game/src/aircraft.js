// EMBERWING — Canyon Courier. The Kestrel K-7 bush plane, built from
// primitives in one coherent livery: cream fuselage, ember wings and tail,
// a glass canopy, a spinning prop and fixed gear. Nothing here is a flat
// shape — the plane reads as built from every angle the camera takes.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var palette = EMBER.config.palette;

  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  function buildAircraft() {
    var group = new THREE.Group();
    group.rotation.order = 'YXZ';
    var cream = lambert(palette.liveryCream);
    var ember = lambert(palette.liveryEmber);
    var dark = lambert(palette.liveryDark);
    var glass = new THREE.MeshPhongMaterial({
      color: 0x2a4a66,
      shininess: 140,
      specular: 0xaaccee,
    });
    var metal = new THREE.MeshLambertMaterial({ color: 0x8a8a92 });

    // Fuselage: a lathed teardrop, nose toward -Z.
    var profile = [
      new THREE.Vector2(0.02, -3.9),
      new THREE.Vector2(0.42, -3.7),
      new THREE.Vector2(0.78, -2.6),
      new THREE.Vector2(0.95, -1.2),
      new THREE.Vector2(0.92, 0.2),
      new THREE.Vector2(0.72, 1.8),
      new THREE.Vector2(0.4, 3.1),
      new THREE.Vector2(0.12, 3.9),
    ];
    var fuselage = new THREE.Mesh(new THREE.LatheGeometry(profile, 14), cream);
    fuselage.rotation.x = -Math.PI / 2;
    fuselage.position.y = 0.1;
    group.add(fuselage);

    // Ember cheatline along each flank.
    [-1, 1].forEach(function (side) {
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 5.6), ember);
      stripe.position.set(side * 0.86, 0.18, -0.4);
      group.add(stripe);
    });

    // Glass canopy over the front seats.
    var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), glass);
    canopy.scale.set(0.95, 0.62, 1.9);
    canopy.position.set(0, 0.78, -1.5);
    group.add(canopy);

    // High main wing, ember on top with cream tips.
    var wing = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.26, 2.2), ember);
    wing.position.set(0, 0.92, -0.9);
    group.add(wing);
    [-1, 1].forEach(function (side) {
      var tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 2.0), cream);
      tip.position.set(side * 5.6, 0.92, -0.9);
      group.add(tip);
      // Wing struts down to the fuselage.
      var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), metal);
      strut.position.set(side * 2.1, -0.1, -0.9);
      strut.rotation.z = side * 0.55;
      group.add(strut);
    });

    // Tail: horizontal stabiliser and a tall fin with a rudder.
    var stab = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 1.15), ember);
    stab.position.set(0, 0.35, 3.4);
    group.add(stab);
    var fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.5), ember);
    fin.position.set(0, 1.0, 3.3);
    fin.rotation.x = -0.18;
    group.add(fin);
    var rudder = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.7), cream);
    rudder.position.set(0, 0.9, 3.95);
    rudder.rotation.x = -0.18;
    group.add(rudder);

    // Propeller: hub, two blades and a faint blur disc.
    var prop = new THREE.Group();
    var hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), dark);
    hub.rotation.x = Math.PI / 2;
    prop.add(hub);
    [-1, 1].forEach(function (side) {
      var blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.09), dark);
      blade.position.y = side * 1.7;
      prop.add(blade);
    });
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.85, 28),
      new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.10,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    prop.add(disc);
    prop.position.set(0, 0.1, -4.05);
    group.add(prop);

    // Fixed gear: two mains and a tail wheel.
    [-1, 1].forEach(function (side) {
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), metal);
      leg.position.set(side * 0.85, -0.85, -0.9);
      leg.rotation.z = side * 0.25;
      group.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.0, -1.35, -0.9);
      group.add(wheel);
    });
    var tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10), dark);
    tailWheel.rotation.z = Math.PI / 2;
    tailWheel.position.set(0, -0.55, 3.5);
    group.add(tailWheel);

    // Navigation lights: red port, green starboard, white strobe on the tail.
    var navPort = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
    );
    navPort.position.set(-5.95, 0.92, -0.9);
    group.add(navPort);
    var navStar = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
    );
    navStar.position.set(5.95, 0.92, -0.9);
    group.add(navStar);
    var strobe = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    strobe.position.set(0, 1.85, 3.9);
    group.add(strobe);

    var spin = 0;
    function update(dt, throttle, elapsed) {
      // The prop spins up with the throttle; the strobe double-blinks.
      spin += dt * (4 + throttle * 55);
      prop.rotation.z = spin;
      var phase = elapsed % 1.4;
      var on = phase < 0.08 || (phase > 0.18 && phase < 0.26);
      strobe.visible = on;
    }

    return { group: group, prop: prop, update: update };
  }

  EMBER.aircraft = { build: buildAircraft };
})();
