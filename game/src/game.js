// EMBERWING — Canyon Courier. The game itself: the state machine (title,
// flying, paused, ended), keyboard and mouse input, the three cameras, the
// main loop, scoring and the shot staging the screenshots are taken from
// (?shot=cover|rings|cockpit|landing, the same pattern the kit's starter
// uses). Everything the other files build comes together here.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var util = EMBER.util;
  var config = EMBER.config;

  var renderer = null;
  var scene = null;
  var camera = null;
  var planeMesh = null;
  var world = null;
  var rings = null;
  var plane = null;
  var sortieIndex = 0;
  var unlocked = 0;
  var bests = [null, null, null];
  var sortieScore = 0;
  var totalScore = 0;
  var state = 'title'; // title | flying | paused | ended
  var cameraMode = 0; // 0 chase, 1 cockpit, 2 high
  var elapsed = 0;
  var lookTarget = null;
  var keys = {};
  var mouse = { x: 0, y: 0, active: false, lastMove: 0 };
  var lastAlarm = 0;
  var lastWarn = '';
  var clock = null;
  var shotMode = null;
  var shotSortie = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function forwardVector() {
    var cp = Math.cos(plane.pitch);
    return new THREE.Vector3(
      -Math.sin(plane.heading) * cp,
      Math.sin(plane.pitch),
      -Math.cos(plane.heading) * cp,
    );
  }

  function startSortie(index, options) {
    options = options || {};
    sortieIndex = index;
    var sortie = config.sorties[index];
    // Rebuild the world for this sortie's light and wind.
    if (world && world.dispose) world.dispose();
    if (rings) rings.dispose();
    scene = new THREE.Scene();
    world = EMBER.terrain.build(scene, sortie);
    rings = EMBER.rings.build(scene, sortie);
    planeMesh = EMBER.aircraft.build();
    scene.add(planeMesh.group);
    plane = EMBER.physics.createPlane(sortie);
    sortieScore = 0;
    state = 'flying';
    EMBER.hud.show('title', false);
    EMBER.hud.show('end', false);
    EMBER.hud.show('pause', false);
    EMBER.hud.show('hud', true);
    EMBER.audio.ensure();
    if (options.teleport) {
      // Shot staging: drop the plane mid-flight, already flying.
      plane.pos.copy(options.teleport.pos);
      plane.vel.copy(options.teleport.vel);
      plane.heading = options.teleport.heading;
      plane.pitch = options.teleport.pitch || 0;
      plane.bank = options.teleport.bank || 0;
      plane.throttle = options.teleport.throttle || 0.7;
      plane.onGround = false;
      if (options.passAllRings) {
        rings.rings.forEach(function (ring) {
          ring.passed = true;
          ring.pillar.visible = false;
          ring.torus.material.color.setHex(0x3dff7a);
        });
      }
      if (options.passUpTo) {
        // Mid-flight staging: the earlier rings are already flown, so the
        // next ring is the one ahead and the arrow points at it, not back
        // down the canyon at a ring the plane has already passed.
        rings.rings.slice(0, options.passUpTo).forEach(function (ring) {
          ring.passed = true;
          ring.pillar.visible = false;
          ring.torus.material.color.setHex(0x3dff7a);
        });
      }
    }
    if (options.cameraMode != null) setCameraMode(options.cameraMode);
    snapCamera();
    EMBER.hud.toast(sortie.name.toUpperCase() + ' — ' + sortie.rings + ' RINGS TO EMBER FLATS', 2600);
  }

  function setCameraMode(mode) {
    cameraMode = mode % 3;
    camera.fov = cameraMode === 1 ? 58 : 62;
    camera.updateProjectionMatrix();
    planeMesh.group.visible = cameraMode !== 1;
  }

  function endSortie(won, title, sub, stats, nextAvailable) {
    state = 'ended';
    EMBER.audio.update(0, 0, false);
    if (won) {
      totalScore += sortieScore;
      EMBER.audio.jingle();
    }
    EMBER.hud.showEnd({
      won: won,
      title: title,
      sub: sub,
      stats: stats,
      hint: nextAvailable
        ? 'Press <b>Enter</b> for the next sortie'
        : 'Press <b>Enter</b> to fly again, or <b>Esc</b> for the menu',
      nextAvailable: nextAvailable,
    });
  }

  function crash(reason) {
    var texts = {
      terrain: ['INTO THE ROCK', 'The canyon keeps what it catches. The Kestrel is done.'],
      hard: ['TOO HARD', 'She hit the strip like a dropped crate. The gear is gone.'],
      fast: ['TOO FAST', 'That was a fly-past, not a landing. The strip ran out.'],
      bank: ['WING DOWN', 'She touched a wingtip first. The canyon does not forgive that.'],
    };
    var pair = texts[reason] || texts.terrain;
    EMBER.audio.thud();
    endSortie(false, pair[0], pair[1], [
      { label: 'Rings flown', value: rings.passedCount() + ' / ' + rings.rings.length },
      { label: 'Score this sortie', value: String(sortieScore) },
      { label: 'Total score', value: String(totalScore) },
      { label: 'Distance flown', value: (plane.distanceFlown / 1000).toFixed(1) + ' km' },
      { label: 'Flight time', value: util.formatTime(plane.time) },
    ], false);
  }

  function landOnDest(vs, speed, lateral) {
    var F = config.flight;
    var S = config.scoring;
    var soft = Math.max(0, 1 - vs / F.landMaxVs);
    var centre = Math.max(0, 1 - Math.abs(lateral) / (config.strips.dest.width / 2));
    var landingScore = S.landingBase + Math.round(S.landingSoftBonus * soft) + Math.round(S.landingCentreBonus * centre);
    var fuelBonus = Math.round(plane.fuel * S.fuelBonusPerUnit);
    var par = S.parTime[sortieIndex];
    var timeBonus = Math.max(0, Math.round((par - plane.time) * S.timeBonusPerSecond));
    sortieScore += landingScore + fuelBonus + timeBonus;
    var title = soft > 0.6 ? 'GREASED IT' : 'DOWN SAFE';
    endSortie(true, title, 'Down at Ember Flats. The mail is through.', [
      { label: 'Rings flown', value: rings.passedCount() + ' / ' + rings.rings.length },
      { label: 'Landing', value: '+' + landingScore + ' pts' },
      { label: 'Fuel left', value: Math.round(plane.fuel) + '%  (+' + fuelBonus + ')' },
      { label: 'Time', value: util.formatTime(plane.time) + '  (+' + timeBonus + ')' },
      { label: 'Sortie score', value: String(sortieScore) },
      { label: 'Total score', value: String(totalScore + sortieScore) },
    ], sortieIndex + 1 < config.sorties.length);
    if (sortieIndex + 1 < config.sorties.length) {
      unlocked = Math.max(unlocked, sortieIndex + 1);
    }
    bests[sortieIndex] = bests[sortieIndex] == null
      ? sortieScore
      : Math.max(bests[sortieIndex], sortieScore);
  }

  function readInput() {
    var k = config.keys;
    function down(list) {
      for (var i = 0; i < list.length; i++) if (keys[list[i]]) return true;
      return false;
    }
    var bankKeys = (down(k.bankRight) ? 1 : 0) - (down(k.bankLeft) ? 1 : 0);
    var pitchKeys = (down(k.pitchUp) ? 1 : 0) - (down(k.pitchDown) ? 1 : 0);
    // The mouse is a stick, but only while its button is held: a resting
    // pointer must never steer the plane by itself.
    var bank = bankKeys;
    var pitch = pitchKeys;
    if (mouse.active) {
      bank += mouse.x * 1.1;
      pitch += -mouse.y * 0.9;
    }
    return {
      bank: util.clamp(bank, -1, 1),
      pitch: util.clamp(pitch, -1, 1),
      throttleUp: down(k.throttleUp),
      throttleDown: down(k.throttleDown),
      brake: down(k.brake),
    };
  }

  function windNow() {
    var sortie = config.sorties[sortieIndex];
    var gust = (Math.sin(elapsed * 0.7) * 0.5 + 0.5) * sortie.gust;
    // Crosswind from the west, gusting; a little along-canyon push too.
    return { x: sortie.wind + gust, z: -1.2, gust: gust };
  }

  function updateFlying(dt) {
    var input = readInput();
    // Leaving the canyon: warn, then gently turn the nose back.
    if (Math.abs(plane.pos.x) > 2350) {
      EMBER.hud.warn('TURN BACK — LEAVING THE CANYON');
      input.bank += plane.pos.x > 0 ? -0.35 : 0.35;
      input.bank = util.clamp(input.bank, -1, 1);
    } else {
      var agl = EMBER.physics.aglFt(plane);
      // On final for Ember Flats the descent is the plan, not a warning:
      // lined up with the strip and inside 1.5 km, the terrain call stays quiet.
      var dest = config.strips.dest;
      var onFinal =
        Math.abs(plane.pos.x - dest.x) < 150 &&
        plane.pos.z < -10200 &&
        plane.pos.z > -12000;
      if (!plane.onGround && !onFinal && agl < 200 && EMBER.physics.vsFpm(plane) < -300) {
        EMBER.hud.warn('TERRAIN — PULL UP');
        if (elapsed - lastAlarm > 1.6) {
          EMBER.audio.alarm();
          lastAlarm = elapsed;
        }
      } else if (plane.fuel < 22 && plane.fuel > 0) {
        EMBER.hud.warn('FUEL LOW — ' + Math.round(plane.fuel) + '%');
        if (elapsed - lastAlarm > 2.5) {
          EMBER.audio.alarm();
          lastAlarm = elapsed;
        }
      } else {
        EMBER.hud.warn(null);
      }
    }

    var event = EMBER.physics.step(plane, dt, input, windNow());
    var hit = rings.update(dt, elapsed, plane.pos);
    if (hit) {
      var speedBonus = Math.round(
        config.scoring.ringSpeedBonus * util.clamp(EMBER.physics.speedKnots(plane) / 160, 0, 1),
      );
      var gained = config.scoring.ringBase + speedBonus;
      sortieScore += gained;
      plane.fuel = Math.min(100, plane.fuel + config.sorties[sortieIndex].fuelPerRing);
      EMBER.audio.ring();
      EMBER.hud.toast(
        'RING ' + rings.passedCount() + '/' + rings.rings.length + '  +' + gained + '  ·  FUEL +' + config.sorties[sortieIndex].fuelPerRing + '%',
        1800,
      );
      if (rings.passedCount() === rings.rings.length) {
        EMBER.hud.toast('ALL RINGS — EMBER FLATS AHEAD, LINE UP FOR THE STRIP', 3000);
      }
    }
    if (event) {
      if (event.type === 'landed') {
        EMBER.audio.thud();
        if (event.strip === 'dest') {
          landOnDest(event.vs, event.speed, event.lateral);
        } else {
          EMBER.hud.toast('DOWN SAFE — THAT IS DUSTLINE FIELD. THE MAIL GOES TO EMBER FLATS.', 3000);
        }
      } else if (event.type === 'crashed') {
        crash(event.reason);
      }
    }
    EMBER.audio.update(plane.throttle, plane.vel.length(), !plane.onGround);
  }

  function cameraTargets() {
    var fwd = forwardVector();
    var desired = new THREE.Vector3();
    var look = new THREE.Vector3();
    if (state === 'title' || state === 'ended') {
      // Slow orbit around the parked plane for the menu backdrop.
      var angle = elapsed * 0.12;
      desired.set(
        plane.pos.x + Math.sin(angle) * 17,
        plane.pos.y + 5.5,
        plane.pos.z + Math.cos(angle) * 17,
      );
      look.copy(plane.pos).add(new THREE.Vector3(0, 1, 0));
    } else if (cameraMode === 1) {
      // Cockpit: at the canopy, looking down the nose.
      desired.copy(plane.pos).addScaledVector(fwd, 0.6);
      desired.y += 0.95;
      look.copy(plane.pos).addScaledVector(fwd, 60);
      look.y += 0.5;
    } else if (cameraMode === 2) {
      desired.copy(plane.pos).addScaledVector(fwd, -10);
      desired.y += 30;
      look.copy(plane.pos).addScaledVector(fwd, 22);
    } else {
      // Chase: behind and above, easing after the plane, with a little
      // lateral sway from the bank so the turn reads.
      var right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
      desired.copy(plane.pos).addScaledVector(fwd, -13.5);
      desired.y += 4.6;
      desired.addScaledVector(right, -plane.bank * 3.2);
      look.copy(plane.pos).addScaledVector(fwd, 26);
      look.y += 1.2;
    }
    return { desired: desired, look: look };
  }

  // Put the camera where it belongs at once (sortie start, teleport, camera
  // change): nobody wants to watch it fly in from kilometres away.
  function snapCamera() {
    var targets = cameraTargets();
    camera.position.copy(targets.desired);
    if (!lookTarget) lookTarget = new THREE.Vector3();
    lookTarget.copy(targets.look);
    camera.lookAt(lookTarget);
  }

  function updateCamera(dt) {
    var targets = cameraTargets();
    camera.position.x = util.damp(camera.position.x, targets.desired.x, 5, dt);
    camera.position.y = util.damp(camera.position.y, targets.desired.y, 5, dt);
    camera.position.z = util.damp(camera.position.z, targets.desired.z, 5, dt);
    if (!lookTarget) lookTarget = targets.look.clone();
    lookTarget.x = util.damp(lookTarget.x, targets.look.x, 8, dt);
    lookTarget.y = util.damp(lookTarget.y, targets.look.y, 8, dt);
    lookTarget.z = util.damp(lookTarget.z, targets.look.z, 8, dt);
    camera.lookAt(lookTarget);
  }

  function hudState() {
    var next = rings.nextRing();
    var dest = config.strips.dest;
    var destDist = null;
    var nextBearing = null;
    var nextDist = null;
    if (plane) {
      var dx = dest.x - plane.pos.x;
      var dz = dest.z - plane.pos.z;
      destDist = Math.sqrt(dx * dx + dz * dz);
    }
    if (next && plane) {
      var rx = next.pos.x - plane.pos.x;
      var rz = next.pos.z - plane.pos.z;
      nextDist = Math.sqrt(rx * rx + rz * rz);
      nextBearing = Math.atan2(-rx, -rz);
    }
    return {
      missionName: config.sorties[sortieIndex].name,
      ringsDone: rings.passedCount(),
      ringsTotal: rings.rings.length,
      time: plane.time,
      headingDeg: EMBER.physics.headingDeg(plane),
      heading: plane.heading,
      pitch: plane.pitch,
      bank: plane.bank,
      throttle: plane.throttle,
      fuel: plane.fuel,
      score: sortieScore,
      totalScore: totalScore,
      speedKt: EMBER.physics.speedKnots(plane),
      vsi: EMBER.physics.vsFpm(plane),
      altFt: EMBER.physics.altitudeFt(plane),
      aglFt: EMBER.physics.aglFt(plane),
      destDist: destDist,
      nextRing: next
        ? { dist: nextDist }
        : null,
      nextRingBearing: nextBearing,
      rings: rings.rings,
      nextRingIndex: next ? next.index : -1,
      pos: plane.pos,
      mouseStick: mouse.active ? { x: mouse.x, y: mouse.y } : null,
    };
  }

  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    if (state === 'flying') {
      updateFlying(dt);
    }
    if (state === 'flying' || state === 'title' || state === 'ended') {
      planeMesh.group.position.copy(plane.pos);
      planeMesh.group.rotation.set(plane.pitch, plane.heading, plane.bank);
      planeMesh.update(dt, plane.throttle, elapsed);
      world.update(dt, elapsed, windNow().x);
      updateCamera(dt);
      if (state === 'flying') EMBER.hud.update(hudState());
    }
    renderer.render(scene, camera);
  }

  function stageShot(shot) {
    // Teleport the plane into a photogenic moment of a real flight.
    var sortie = config.sorties[shotSortie];
    var ring = rings.rings[Math.min(1, rings.rings.length - 1)];
    var fwd = new THREE.Vector3(0, 0, -1);
    if (shot === 'cover') {
      // Lined up on the first ring, 420 m out, a touch of bank: the plane
      // flies through the ring a few seconds after the shot is taken.
      return {
        teleport: {
          pos: new THREE.Vector3(ring.pos.x + 15, ring.pos.y + 8, ring.pos.z + 420),
          vel: new THREE.Vector3(0, 0, -55),
          heading: 0.03,
          pitch: 0.02,
          bank: 0.15,
          throttle: 0.78,
        },
        cameraMode: 0,
        passUpTo: 1,
      };
    }
    if (shot === 'rings') {
      var ring3 = rings.rings[Math.min(3, rings.rings.length - 1)];
      return {
        teleport: {
          pos: new THREE.Vector3(ring3.pos.x + 15, ring3.pos.y + 8, ring3.pos.z + 620),
          vel: new THREE.Vector3(0, 0, -60),
          heading: -0.02,
          pitch: 0.0,
          bank: -0.1,
          throttle: 0.8,
        },
        cameraMode: 0,
        passUpTo: 3,
      };
    }
    if (shot === 'cockpit') {
      // On final for Ember Flats, 800 m out: the strip ahead, the canyon
      // walls either side, and no ring in the face (the last ring sits
      // 500 m further on, so this spot keeps the view clean).
      return {
        teleport: {
          pos: new THREE.Vector3(40, 110, -9850),
          vel: new THREE.Vector3(0, -3, -48),
          heading: 0.02,
          pitch: -0.03,
          bank: 0.05,
          throttle: 0.5,
        },
        cameraMode: 1,
        // All but the last ring are flown, so the arrow points at the
        // final ring ahead instead of back down the canyon. Counted from
        // the sortie, not the title world's rings, which are a different
        // set when the shot uses another sortie.
        passUpTo: config.sorties[shotSortie].rings - 1,
      };
    }
    if (shot === 'landing') {
      // A shallow final: 18 m up, 60 m short of the threshold, sinking
      // about 3.5 m/s, so she settles onto the strip on her own — the
      // browser test only has to brake her once she is down.
      return {
        teleport: {
          pos: new THREE.Vector3(0, 18, -10720),
          vel: new THREE.Vector3(0, -1.5, -40),
          heading: 0.01,
          pitch: -0.05,
          bank: 0.0,
          throttle: 0.3,
        },
        cameraMode: 0,
        passAllRings: true,
      };
    }
    return {};
  }

  function boot() {
    var params = new URLSearchParams(window.location.search);
    shotMode = params.get('shot');
    shotSortie = Math.min(
      config.sorties.length - 1,
      Math.max(0, parseInt(params.get('sortie') || '0', 10) || 0),
    );

    var canvas = $('scene');
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    } catch (e) {
      EMBER.hud.showFatal();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputEncoding = THREE.sRGBEncoding;

    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 22000);
    camera.position.set(16, 6, 140);
    lookTarget = new THREE.Vector3(0, 2, 0);
    clock = new THREE.Clock();

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Input: keys, and the mouse as a virtual stick.
    window.addEventListener('keydown', function (e) {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) !== -1) {
        e.preventDefault();
      }
      if (e.repeat) return;
      keys[e.code] = true;
      if (config.keys.camera.indexOf(e.code) !== -1 && state === 'flying') {
        setCameraMode(cameraMode + 1);
      }
      if (config.keys.pause.indexOf(e.code) !== -1) {
        if (state === 'flying') {
          state = 'paused';
          EMBER.hud.showPause(true);
        } else if (state === 'paused') {
          state = 'flying';
          EMBER.hud.showPause(false);
        } else if (state === 'ended') {
          showTitleScreen();
        }
      }
      if (config.keys.mute.indexOf(e.code) !== -1) {
        EMBER.audio.setMuted(!EMBER.audio.isMuted());
      }
      if (config.keys.restart.indexOf(e.code) !== -1 && (state === 'flying' || state === 'paused')) {
        startSortie(sortieIndex);
      }
      if (config.keys.confirm.indexOf(e.code) !== -1) {
        if (state === 'title') startSortie(sortieIndex);
        else if (state === 'paused') {
          state = 'flying';
          EMBER.hud.showPause(false);
        } else if (state === 'ended') {
          if (sortieIndex + 1 < config.sorties.length && unlocked > sortieIndex) {
            startSortie(sortieIndex + 1);
          } else {
            startSortie(sortieIndex);
          }
        }
      }
    });
    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });
    window.addEventListener('mousemove', function (e) {
      mouse.x = util.clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1);
      mouse.y = util.clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
      mouse.lastMove = elapsed;
    });
    window.addEventListener('mousedown', function () {
      mouse.active = true;
    });
    window.addEventListener('mouseup', function () {
      mouse.active = false;
    });
    window.addEventListener('blur', function () {
      keys = {};
    });

    EMBER.hud.init({
      onFly: function () {
        EMBER.audio.click();
        startSortie(sortieIndex);
      },
      onSelectSortie: function (i) {
        sortieIndex = i;
        EMBER.audio.click();
        showTitleScreen();
      },
      onNext: function () {
        EMBER.audio.click();
        startSortie(Math.min(sortieIndex + 1, config.sorties.length - 1));
      },
      onRetry: function () {
        EMBER.audio.click();
        startSortie(sortieIndex);
      },
      onMenu: function () {
        EMBER.audio.click();
        showTitleScreen();
      },
    });

    // A parked plane on the strip behind the title screen.
    scene = new THREE.Scene();
    world = EMBER.terrain.build(scene, config.sorties[0]);
    rings = EMBER.rings.build(scene, config.sorties[0]);
    planeMesh = EMBER.aircraft.build();
    scene.add(planeMesh.group);
    plane = EMBER.physics.createPlane(config.sorties[0]);

    if (shotMode) {
      // Screenshots: skip the menu and drop straight into the staged moment.
      var staged = stageShot(shotMode);
      startSortie(shotSortie, staged);
    } else {
      showTitleScreen();
    }
    loop();
  }

  function showTitleScreen() {
    state = 'title';
    // Rebuild the menu backdrop on the selected sortie's world.
    if (world && world.dispose) world.dispose();
    if (rings) rings.dispose();
    scene = new THREE.Scene();
    world = EMBER.terrain.build(scene, config.sorties[sortieIndex]);
    rings = EMBER.rings.build(scene, config.sorties[sortieIndex]);
    planeMesh = EMBER.aircraft.build();
    scene.add(planeMesh.group);
    plane = EMBER.physics.createPlane(config.sorties[sortieIndex]);
    snapCamera();
    EMBER.hud.showTitle(config.sorties, unlocked, bests, sortieIndex);
  }

  EMBER.game = { boot: boot };

  // Debug handle for automated play-testing: read-only snapshots of the
  // live state, so a headless run can prove takeoff, rings and landings.
  EMBER.debug = {
    state: function () { return state; },
    plane: function () {
      if (!plane) return null;
      return {
        x: +plane.pos.x.toFixed(1),
        y: +plane.pos.y.toFixed(1),
        z: +plane.pos.z.toFixed(1),
        speed: +plane.vel.length().toFixed(1),
        throttle: +plane.throttle.toFixed(2),
        fuel: +plane.fuel.toFixed(1),
        heading: +plane.heading.toFixed(3),
        pitch: +plane.pitch.toFixed(3),
        bank: +plane.bank.toFixed(3),
        onGround: plane.onGround,
        time: +plane.time.toFixed(1),
      };
    },
    rings: function () {
      return rings ? rings.passedCount() + '/' + rings.rings.length : null;
    },
    score: function () {
      return { sortie: sortieScore, total: totalScore };
    },
    sceneInfo: function () {
      if (!scene || !planeMesh || !renderer) return null;
      var info = {
        state: state,
        planeGroupPos: planeMesh.group.position.toArray().map(function (v) { return +v.toFixed(1); }),
        planeVisible: planeMesh.group.visible,
        planeChildren: planeMesh.group.children.length,
        cameraPos: camera.position.toArray().map(function (v) { return +v.toFixed(1); }),
        sceneChildren: scene.children.length,
        triangles: renderer.info.render.triangles,
        calls: renderer.info.render.calls,
      };
      return info;
    },
  };
})();
