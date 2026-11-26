// EMBERWING — Canyon Courier. The flight model: an arcade wing with real
// trade-offs. Throttle buys speed, speed buys lift, bank buys a turn and
// costs drag, and below the stall speed the wing stops answering and the
// plane sinks. Take off from the strip, mind the fuel, and put her down
// gently — a hard, fast or banked touchdown is a crash.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});
  var util = EMBER.util;
  var GEAR = 1.5; // group origin height above the ground while rolling

  function createPlane(sortie) {
    var start = EMBER.config.strips.start;
    return {
      pos: new THREE.Vector3(start.x, GEAR, start.z),
      vel: new THREE.Vector3(0, 0, 0),
      heading: 0, // radians, 0 = north (-Z), grows toward west
      pitch: 0,
      bank: 0,
      throttle: 0,
      fuel: sortie.fuel,
      onGround: true,
      time: 0,
      distanceFlown: 0,
    };
  }

  // One physics step. input: {bank, pitch, throttleUp, throttleDown, brake}
  // with bank/pitch in [-1, 1]. wind: {x, z, gust}. Returns an event or null.
  function step(state, dt, input, wind) {
    var F = EMBER.config.flight;
    var terrain = EMBER.terrain;

    if (input.throttleUp) state.throttle = util.clamp(state.throttle + 0.55 * dt, 0, 1);
    if (input.throttleDown) state.throttle = util.clamp(state.throttle - 0.55 * dt, 0, 1);
    if (state.fuel <= 0) state.throttle = 0;

    var speed = state.vel.length();
    var authority = util.clamp(speed / F.stallSpeed, 0.3, 1);

    // Gusts buffet the wing a touch; the pilot feels them in the stick.
    var gustBank = Math.sin(state.time * 5.1) * wind.gust * 0.07;
    var targetBank = util.clamp(input.bank, -1, 1) * F.maxBank + gustBank;
    var targetPitch = util.clamp(input.pitch, -1, 1) * F.maxPitch;
    state.bank = util.damp(state.bank, targetBank, 3.4 * authority, dt);
    state.pitch = util.damp(state.pitch, targetPitch, 2.8 * authority, dt);

    if (state.onGround) {
      // Rolling: the nose follows the strip, the bank only steers a little.
      state.heading += input.bank * 0.28 * dt * util.clamp(speed / 20, 0, 1);
      var accel = F.thrustAccel * state.throttle - 0.4 - speed * 0.02;
      if (input.brake) accel -= F.brakeDecel;
      speed = Math.max(0, speed + accel * dt);
      var fx = -Math.sin(state.heading);
      var fz = -Math.cos(state.heading);
      state.vel.set(fx * speed, 0, fz * speed);
      state.pos.addScaledVector(state.vel, dt);
      state.pos.y = terrain.groundHeight(state.pos.x, state.pos.z) + GEAR;
      state.distanceFlown += speed * dt;
      if (speed >= F.takeoffSpeed && state.pitch > 0.05) {
        state.onGround = false;
        state.pitch = 0.12;
        state.vel.y = 2;
      }
    } else {
      // Bank turns the heading; the turn rate falls as speed rises.
      state.heading += (9.81 * Math.tan(state.bank) / Math.max(speed, 18)) * F.turnAuthority * dt;

      // The wing flies at an angle of attack: the flight path sits a little
      // below the nose, more so when slow. A gentle pull-back flattens the
      // descent instead of ballooning the plane.
      var aoa = 0.1 * util.clamp(
        (F.stallSpeed / Math.max(speed, 1)) * (F.stallSpeed / Math.max(speed, 1)),
        0.25,
        1,
      );
      var pathPitch = state.pitch - aoa;
      var cp = Math.cos(pathPitch);
      var fwdX = -Math.sin(state.heading) * cp;
      var fwdY = Math.sin(pathPitch);
      var fwdZ = -Math.cos(state.heading) * cp;

      // Scalar speed along the nose: thrust minus drag, and climbing trades
      // speed for height while diving gives it back.
      var drag = F.dragBase * speed * speed + F.dragTurn * Math.abs(state.bank) * speed;
      if (input.brake) drag += F.brakeAir;
      speed += (F.thrustAccel * state.throttle - drag) * dt;
      speed -= Math.sin(pathPitch) * 5.4 * dt;
      speed = util.clamp(speed, F.minSpeed, 130);

      // The velocity eases onto the nose. Below the stall the wing sinks:
      // lift stops countering gravity and the plane mushes down.
      var lift = Math.min(1, (speed / F.stallSpeed) * (speed / F.stallSpeed));
      var sink = 9.81 * (1 - lift);
      if (speed < F.stallSpeed) {
        sink += F.sinkAtStall * (1 - speed / F.stallSpeed);
      }
      var align = 1 - Math.exp(-2.2 * dt);
      state.vel.x += (fwdX * speed - state.vel.x) * align;
      state.vel.y += (fwdY * speed - sink * 0.6 - state.vel.y) * align;
      state.vel.z += (fwdZ * speed - state.vel.z) * align;

      // Ground effect: a little cushion in the last few metres.
      var groundY = terrain.groundHeight(state.pos.x, state.pos.z);
      var agl = state.pos.y - groundY;
      if (agl < F.groundEffect && state.vel.y < 0) {
        state.vel.y += (1 - agl / F.groundEffect) * 2.4 * dt;
      }

      // Wind drift.
      state.vel.x += wind.x * dt * 0.6;
      state.vel.z += wind.z * dt * 0.6;

      state.pos.addScaledVector(state.vel, dt);
      state.distanceFlown += speed * dt;

      // Ground contact: a landing or a crash.
      var gy = terrain.groundHeight(state.pos.x, state.pos.z);
      if (state.pos.y <= gy + GEAR) {
        state.pos.y = gy + GEAR;
        var vs = -state.vel.y;
        var strip = terrain.onStrip(state.pos.x, state.pos.z);
        var landed =
          strip !== null &&
          vs <= F.landMaxVs &&
          speed <= F.landMaxSpeed &&
          Math.abs(state.bank) <= F.landMaxBank &&
          Math.abs(state.pitch) < 0.18;
        if (landed) {
          state.onGround = true;
          state.vel.y = 0;
          state.pitch = 0;
          state.bank = 0;
          return { type: 'landed', strip: strip.name, vs: vs, speed: speed, lateral: strip.lateral };
        }
        var reason = 'terrain';
        if (strip !== null) {
          if (vs > F.landMaxVs) reason = 'hard';
          else if (speed > F.landMaxSpeed) reason = 'fast';
          else if (Math.abs(state.bank) > F.landMaxBank) reason = 'bank';
        }
        return { type: 'crashed', reason: reason, vs: vs, speed: speed };
      }
    }

    // Fuel burn: idle sips, full throttle drinks.
    var burn = F.fuelBurnIdle + state.throttle * (F.fuelBurnFull - F.fuelBurnIdle);
    if (input.brake) burn *= 0.8;
    state.fuel = Math.max(0, state.fuel - burn * dt);
    state.time += dt;
    return null;
  }

  function speedKnots(state) {
    return state.vel.length() * 1.944;
  }

  function altitudeFt(state) {
    return state.pos.y * 3.281;
  }

  function aglFt(state) {
    return (state.pos.y - EMBER.terrain.groundHeight(state.pos.x, state.pos.z)) * 3.281;
  }

  function vsFpm(state) {
    return state.vel.y * 196.85;
  }

  function headingDeg(state) {
    return ((-state.heading * 180) / Math.PI % 360 + 360) % 360;
  }

  EMBER.physics = {
    createPlane: createPlane,
    step: step,
    speedKnots: speedKnots,
    altitudeFt: altitudeFt,
    aglFt: aglFt,
    vsFpm: vsFpm,
    headingDeg: headingDeg,
  };
})();
