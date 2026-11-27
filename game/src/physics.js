// EMBERWING II — Ember Valley. The flight model: an arcade plane that still
// asks for throttle and turn discipline. Throttle builds speed, pitch trades
// speed for height, bank turns the heading, and below stall speed the wing
// stops answering and the nose drops. Ground contact is either a landing
// (on a strip, gentle, slow, level, aligned) or a crash.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;
  var cfg = EMBER2.config;
  var F = cfg.flight;

  // How high the plane's origin sits when its wheels touch the ground.
  var GEAR_HEIGHT = 1.55;

  function Physics() {
    this.pos = new THREE.Vector3(0, GEAR_HEIGHT, cfg.strips.home.z);
    this.heading = cfg.strips.home.heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.vs = 0;
    this.onGround = true;
    this.fuel = 100;
    this.stalled = false;
    this.distanceFlown = 0;
  }

  Physics.prototype.reset = function (sortie) {
    var strip = cfg.strips.home;
    this.pos.set(strip.x, GEAR_HEIGHT, strip.z);
    this.heading = strip.heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.vs = 0;
    this.onGround = true;
    this.fuel = sortie.fuel;
    this.stalled = false;
    this.distanceFlown = 0;
  };

  // Place the plane mid-air (for screenshot staging and autopilot legs).
  Physics.prototype.placeAirborne = function (pos, heading, speed, throttle) {
    this.pos.copy(pos);
    this.heading = heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = speed;
    this.throttle = throttle;
    this.vs = 0;
    this.onGround = false;
    this.stalled = false;
  };

  // Is (x, z) on a strip, and which one? Strips run north (-Z).
  Physics.prototype.stripAt = function (x, z) {
    var strips = [cfg.strips.home, cfg.strips.far];
    for (var i = 0; i < strips.length; i++) {
      var s = strips[i];
      if (Math.abs(x - s.x) <= s.width / 2 + 6 && Math.abs(z - s.z) <= s.length / 2 + 10) {
        return s;
      }
    }
    return null;
  };

  // One step. `input` carries the pilot's (or autopilot's) wishes:
  // pitch/roll in [-1, 1] (+ is up / right), throttleUp/throttleDown,
  // throttleSet (autopilot override, null for manual), brake, wind {x, z}.
  // Returns null, or an event: 'landed' | 'crash-terrain' | 'crash-landing'.
  Physics.prototype.step = function (dt, input, terrain) {
    var terrainH = terrain.heightAt(this.pos.x, this.pos.z);
    var agl = this.pos.y - GEAR_HEIGHT - terrainH;

    // Throttle: manual keys nudge it, autopilot sets it outright.
    if (input.throttleSet !== null && input.throttleSet !== undefined) {
      this.throttle = util.clamp(input.throttleSet, 0, 1);
    } else {
      if (input.throttleUp) this.throttle += dt * 0.55;
      if (input.throttleDown) this.throttle -= dt * 0.55;
      this.throttle = util.clamp(this.throttle, 0, 1);
    }
    if (this.fuel <= 0) this.throttle = 0;

    // Authority fades when stalled; the nose drops on its own.
    var authority = this.stalled ? 0.35 : 1;
    var targetPitch = util.clamp(input.pitch, -1, 1) * F.maxPitch * authority;
    var targetRoll = util.clamp(input.roll, -1, 1) * F.maxBank * authority;
    if (this.onGround) targetPitch = Math.max(0, targetPitch);
    this.pitch += util.clamp(targetPitch - this.pitch, -F.pitchRate * dt, F.pitchRate * dt);
    this.roll += util.clamp(targetRoll - this.roll, -F.rollRate * dt, F.rollRate * dt);
    // Gentle auto-level in the air when the stick is centred.
    if (!this.onGround && Math.abs(input.roll) < 0.05) {
      this.roll *= Math.max(0, 1 - dt * 0.4);
    }
    if (this.stalled) {
      this.pitch = util.lerp(this.pitch, -0.12, dt * 0.8);
    }

    // Speed: thrust, drag, and the cost of climbing.
    var thrust = this.throttle * F.thrustAccel;
    var drag = F.dragBase * this.speed * this.speed + F.dragTurn * Math.abs(Math.sin(this.roll)) * this.speed;
    var gravityAlong = 9.8 * Math.sin(this.pitch);
    this.speed += (thrust - drag - gravityAlong) * dt;
    if (input.brake) this.speed -= (this.onGround ? F.brakeDecel : F.brakeAir) * dt;
    this.speed = util.clamp(this.speed, 0, F.maxSpeed);
    if (!this.onGround && this.speed < F.minSpeed) this.speed = F.minSpeed;
    this.stalled = !this.onGround && this.speed < F.stallSpeed;

    // Vertical speed: along the flight path, less when stalled, cushioned
    // by ground effect in the last few metres.
    var vs = this.speed * Math.sin(this.pitch) * F.climbFactor;
    if (this.stalled) vs -= F.sinkAtStall * (1 - this.speed / F.stallSpeed);
    if (!this.onGround && agl < F.groundEffect && vs < 0) vs *= 0.55;
    this.vs = vs;

    // Turn: bank turns the heading, faster when fast.
    if (!this.onGround && !this.stalled) {
      var turn = Math.sin(this.roll) * F.turnAuthority * 0.33 * (0.35 + 0.65 * (this.speed / F.maxSpeed));
      this.heading -= turn * dt;
    }

    // Move: forward along the heading, pitched by the climb, plus wind.
    var fx = -Math.sin(this.heading);
    var fz = -Math.cos(this.heading);
    var hSpeed = this.speed * Math.cos(this.pitch);
    var prevX = this.pos.x;
    var prevZ = this.pos.z;
    this.pos.x += fx * hSpeed * dt + (input.wind ? input.wind.x : 0) * dt;
    this.pos.z += fz * hSpeed * dt + (input.wind ? input.wind.z : 0) * dt;
    if (!this.onGround) this.pos.y += vs * dt;
    this.distanceFlown += Math.sqrt(
      (this.pos.x - prevX) * (this.pos.x - prevX) + (this.pos.z - prevZ) * (this.pos.z - prevZ),
    );
    // A generous fence so the plane never leaves the built world.
    this.pos.x = util.clamp(this.pos.x, -2550, 2550);
    this.pos.z = util.clamp(this.pos.z, -12050, 1050);

    // Fuel: idle sips, full throttle drinks; rings top it up.
    var burn = F.fuelBurnIdle + (F.fuelBurnFull - F.fuelBurnIdle) * this.throttle;
    this.fuel = Math.max(0, this.fuel - burn * dt);

    // Ground contact.
    terrainH = terrain.heightAt(this.pos.x, this.pos.z);
    if (this.onGround) {
      this.pos.y = terrainH + GEAR_HEIGHT;
      if (this.speed >= F.takeoffSpeed && this.pitch > 0.06) {
        this.onGround = false;
      }
      return null;
    }
    if (this.pos.y <= terrainH + GEAR_HEIGHT) {
      this.pos.y = terrainH + GEAR_HEIGHT;
      var strip = this.stripAt(this.pos.x, this.pos.z);
      var aligned = strip ? Math.abs(util.angleDelta(this.heading, strip.heading)) < 0.35 : false;
      if (
        strip &&
        this.vs >= -F.landMaxVs &&
        this.speed <= F.landMaxSpeed &&
        Math.abs(this.roll) <= F.landMaxBank &&
        aligned
      ) {
        this.onGround = true;
        this.pitch = 0;
        return 'landed';
      }
      return strip ? 'crash-landing' : 'crash-terrain';
    }
    return null;
  };

  EMBER2.Physics = Physics;
  EMBER2.GEAR_HEIGHT = GEAR_HEIGHT;
})();
