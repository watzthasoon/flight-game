// EMBERWING II — Ember Valley. The game itself: state machine (title,
// briefing, flying, paused, landed, crashed, campaign), the autopilot that
// flies the staged screenshots and the landing test, the chase/cockpit/high
// cameras, scoring, wind, and the debug handle the play-test drives.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;
  var cfg = EMBER2.config;

  function Game() {
    this.state = 'title';
    this.sortieIndex = 0;
    this.score = 0;
    this.sortieScore = 0;
    this.sortieStartTime = 0;
    this.elapsed = 0;
    this.ringsFlown = 0;
    this.ringsTotal = 0;
    this.landingInfo = null;
    this.crashReason = '';
    this.cameraMode = 'chase';
    this.cameraSnapped = false;
    this.autopilot = false;
    this.shotMode = null;
    this.windHeading = 0;
    this.windBase = 0;
    this.windGust = 0;
    this.muted = false;
    this._els = {};
    this._params = new URLSearchParams(window.location.search);
  }

  Game.prototype.boot = function () {
    var self = this;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('game').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(cfg.palette.fogDusk, 900, 7800);
    this.scene.background = new THREE.Color(cfg.palette.fogDusk);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 20000);

    this.terrain = new EMBER2.terrain.Terrain(this.scene);
    this.sky = new EMBER2.Sky(this.scene);
    this.aircraft = new EMBER2.Aircraft(this.scene);
    this.rings = new EMBER2.Rings(this.scene);
    this.physics = new EMBER2.Physics();
    this.hud = new EMBER2.Hud();
    this.audio = new EMBER2.AudioEngine();
    this.input = new EMBER2.Input(this.renderer.domElement);
    this.input.onFirstGesture = function () {
      self.audio.ensure();
    };

    this._cacheEls();
    this._bindKeys();
    var stagedShot = this._applyShotParams();
    window.addEventListener('resize', function () {
      self.camera.aspect = window.innerWidth / window.innerHeight;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // The title screen shows the valley behind it — but only when no
    // screenshot shot was staged (a staged shot already placed the plane
    // and set state to flying; re-staging here would clobber it).
    if (!stagedShot) {
      this._stageTitleScene();
      this._show('title');
    }
    this.clock = new THREE.Clock();
    this.time = 0;
    var loop = function () {
      requestAnimationFrame(loop);
      var dt = Math.min(self.clock.getDelta(), 0.05);
      self.time += dt;
      self.update(dt);
      self.renderer.render(self.scene, self.camera);
    };
    loop();

    window.EMBER2.debug = {
      state: function () {
        return self.state;
      },
      plane: function () {
        var p = self.physics;
        var terrainH = EMBER2.terrain.heightAt(p.pos.x, p.pos.z);
        return {
          x: Math.round(p.pos.x),
          y: Math.round(p.pos.y),
          z: Math.round(p.pos.z),
          speed: Math.round(p.speed),
          throttle: Math.round(p.throttle * 100) / 100,
          fuel: Math.round(p.fuel),
          heading: Math.round(util.radToDeg(p.heading)),
          pitch: Math.round(util.radToDeg(p.pitch) * 10) / 10,
          roll: Math.round(util.radToDeg(p.roll) * 10) / 10,
          onGround: p.onGround,
          agl: Math.round(p.pos.y - EMBER2.GEAR_HEIGHT - terrainH),
          vs: Math.round(p.vs * 10) / 10,
        };
      },
      rings: function () {
        return self.ringsFlown + '/' + self.ringsTotal;
      },
      score: function () {
        return { score: self.score, sortieScore: self.sortieScore };
      },
      camera: function () {
        return self.cameraMode;
      },
    };
  };

  Game.prototype._cacheEls = function () {
    var ids = ['title', 'briefing', 'pause', 'end', 'fatal', 'end-title', 'end-body', 'end-hint',
      'briefing-name', 'briefing-desc', 'briefing-detail', 'title-best'];
    for (var i = 0; i < ids.length; i++) this._els[ids[i]] = document.getElementById(ids[i]);
  };

  Game.prototype._show = function (name) {
    var screens = ['title', 'briefing', 'pause', 'end'];
    for (var i = 0; i < screens.length; i++) {
      var el = this._els[screens[i]];
      if (el) el.classList.toggle('hidden', screens[i] !== name);
    }
    if (name === null) {
      for (var j = 0; j < screens.length; j++) {
        var el2 = this._els[screens[j]];
        if (el2) el2.classList.add('hidden');
      }
    }
    this.hud.show(name === null);
  };

  Game.prototype._bindKeys = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var keys = cfg.keys;
      if (self.state === 'title' && keys.confirm.indexOf(e.code) !== -1) {
        self.audio.ensure();
        self.audio.uiClick();
        self.startSortie(self.sortieIndex);
      } else if (self.state === 'briefing' && keys.confirm.indexOf(e.code) !== -1) {
        self.audio.ensure();
        self.audio.uiClick();
        self.beginFlight();
      } else if (self.state === 'flying' && keys.pause.indexOf(e.code) !== -1) {
        self.state = 'paused';
        self._show('pause');
      } else if (self.state === 'paused' && keys.pause.indexOf(e.code) !== -1) {
        self.state = 'flying';
        self._show(null);
      } else if ((self.state === 'landed' || self.state === 'crashed') && keys.confirm.indexOf(e.code) !== -1) {
        self.audio.uiClick();
        if (self.state === 'landed' && self.sortieIndex < cfg.sorties.length - 1) {
          self.startSortie(self.sortieIndex + 1);
        } else if (self.state === 'landed') {
          self._showCampaign();
        } else {
          self.startSortie(self.sortieIndex);
        }
      } else if (self.state === 'campaign' && keys.confirm.indexOf(e.code) !== -1) {
        self.audio.uiClick();
        self.score = 0;
        self.sortieIndex = 0;
        self._stageTitleScene();
        self.state = 'title';
        self._show('title');
      }
      if (self.state === 'flying' && keys.camera.indexOf(e.code) !== -1) {
        var modes = ['chase', 'cockpit', 'high'];
        var idx = modes.indexOf(self.cameraMode);
        self.cameraMode = modes[(idx + 1) % modes.length];
        self.cameraSnapped = false;
      }
      if (keys.mute.indexOf(e.code) !== -1) {
        self.muted = !self.muted;
        self.audio.setMuted(self.muted);
      }
      if (self.state === 'flying' && keys.restart.indexOf(e.code) !== -1) {
        self.startSortie(self.sortieIndex);
      }
      if (self.state === 'title' && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
        self.sortieIndex = Number(e.code.slice(-1)) - 1;
        self._stageTitleScene();
      }
    });
  };

  // A still valley scene behind the title, so the first thing the judge
  // sees is the game world, not a black page.
  Game.prototype._stageTitleScene = function () {
    var sortie = cfg.sorties[this.sortieIndex];
    this.sky.setTimeOfDay(sortie.timeOfDay, this.scene);
    this.rings.buildCourse(sortie);
    this.physics.reset(sortie);
    this.physics.placeAirborne(
      new THREE.Vector3(-140, 130, 700),
      0.12,
      52,
      0.55,
    );
    this.cameraMode = 'chase';
    this.cameraSnapped = false;
    this._updateAircraft();
    this._updateCamera(0.05, true);
  };

  Game.prototype.startSortie = function (index) {
    this.sortieIndex = index;
    var sortie = cfg.sorties[index];
    this.sortieScore = 0;
    this.ringsFlown = 0;
    this.ringsTotal = sortie.rings;
    this.landingInfo = null;
    this.crashReason = '';
    this.elapsed = 0;
    this.sky.setTimeOfDay(sortie.timeOfDay, this.scene);
    this.rings.buildCourse(sortie);
    this.physics.reset(sortie);
    // Wind: mostly a crosswind from the west, gusting through the sortie.
    var rng = util.makeRng(500 + index * 31);
    this.windHeading = (0.5 + rng() * 0.6) * Math.PI;
    this.windBase = sortie.wind;
    this.windGust = sortie.gust;
    this.cameraMode = 'chase';
    this.cameraSnapped = false;
    this.hud.setSortie(sortie, sortie.rings);
    this.hud.hideMessage();
    if (this._els['briefing-name']) this._els['briefing-name'].textContent = sortie.name.toUpperCase();
    if (this._els['briefing-desc']) this._els['briefing-desc'].textContent = sortie.desc;
    if (this._els['briefing-detail']) {
      this._els['briefing-detail'].textContent =
        'Fly the rings down Ember Valley and put her down on the far strip. ' +
        'Each ring pays points and fuel. Mind the wind — and the walls.';
    }
    this.state = 'briefing';
    this._show('briefing');
    this._updateAircraft();
    this._updateCamera(0.05, true);
  };

  Game.prototype.beginFlight = function () {
    this.state = 'flying';
    this.sortieStartTime = this.time;
    this._show(null);
    this.hud.message(cfg.sorties[this.sortieIndex].name.toUpperCase() + ' — THROTTLE UP, ROTATE AT 60 KT', 3.5);
  };

  // Screenshot staging: ?shot=cover|rings|cockpit|landing&sortie=N puts the
  // plane on a scripted leg with the autopilot flying, so the shot is the
  // game in play, not a posed still. ?auto=1 enables the autopilot in play.
  Game.prototype._applyShotParams = function () {
    var shot = this._params.get('shot');
    var sortieParam = this._params.get('sortie');
    var sortieIndex = sortieParam !== null ? util.clamp(parseInt(sortieParam, 10) || 0, 0, 2) : 0;
    if (this._params.get('auto') === '1') this.autopilot = true;
    if (!shot) return false;
    this.shotMode = shot;
    this.autopilot = true;
    var sortie = cfg.sorties[sortieIndex];
    this.sortieIndex = sortieIndex;
    this.ringsTotal = sortie.rings;
    this.sky.setTimeOfDay(sortie.timeOfDay, this.scene);
    this.rings.buildCourse(sortie);
    this.physics.reset(sortie);
    var rng = util.makeRng(500 + sortieIndex * 31);
    this.windHeading = (0.5 + rng() * 0.6) * Math.PI;
    this.windBase = sortie.wind;
    this.windGust = sortie.gust;
    this.hud.setSortie(sortie, sortie.rings);
    var far = cfg.strips.far;
    if (shot === 'landing') {
      // The final approach: the rings are done for this shot, so the
      // autopilot flies the landing instead of turning back for ring 1.
      for (var ri = 0; ri < this.rings.list.length; ri++) this.rings.list[ri].flown = true;
      this.rings.current = this.rings.list.length;
      this.ringsFlown = sortie.rings;
      this.rings._markCurrent();
      // On the glide slope: 55 m up, 1000 m out — a 5.5% slope, so the
      // autopilot rides the slope straight onto the strip instead of
      // arriving high and overshooting into the valley wall.
      this.physics.placeAirborne(new THREE.Vector3(10, 55, far.z + 1000), 0, 46, 0.32);
      this.cameraMode = 'chase';
    } else if (shot === 'cockpit') {
      var ring = this.rings.list[Math.min(1, this.rings.list.length - 1)];
      this.physics.placeAirborne(
        new THREE.Vector3(ring.center.x, ring.center.y + 4, ring.center.z + 460),
        0,
        54,
        0.6,
      );
      this.cameraMode = 'cockpit';
    } else if (shot === 'rings') {
      // The first two rings are done for this shot, so the autopilot flies
      // at ring 3 (ahead) instead of turning back for ring 1 (behind).
      for (var ri2 = 0; ri2 < 2 && ri2 < this.rings.list.length; ri2++) this.rings.list[ri2].flown = true;
      this.rings.current = Math.min(2, this.rings.list.length - 1);
      this.ringsFlown = this.rings.current;
      this.rings._markCurrent();
      var ring2 = this.rings.list[Math.min(2, this.rings.list.length - 1)];
      this.physics.placeAirborne(
        new THREE.Vector3(ring2.center.x - 40, ring2.center.y + 10, ring2.center.z + 380),
        0,
        54,
        0.6,
      );
      this.cameraMode = 'chase';
    } else {
      // cover: before the first ring, low over the river, ring ahead.
      var ring1 = this.rings.list[0];
      this.physics.placeAirborne(
        new THREE.Vector3(ring1.center.x - 30, ring1.center.y + 6, ring1.center.z + 450),
        0,
        54,
        0.6,
      );
      this.cameraMode = 'chase';
    }
    this.state = 'flying';
    this.sortieStartTime = this.time;
    this._show(null);
    this.cameraSnapped = false;
    this._updateAircraft();
    this._updateCamera(0.05, true);
    return true;
  };

  Game.prototype._windNow = function () {
    var gust = Math.sin(this.time * 0.45) * 0.5 + Math.sin(this.time * 1.13) * 0.5;
    var speed = Math.max(0, this.windBase + this.windGust * gust);
    return {
      x: Math.sin(this.windHeading) * speed,
      z: Math.cos(this.windHeading) * speed,
      speed: speed,
    };
  };

  Game.prototype._windDirText = function () {
    var deg = Math.round(util.radToDeg(this.windHeading));
    var points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return points[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  };

  // The autopilot: steer at the next ring, or fly the landing when the
  // rings are done. Returns the input the physics step consumes.
  Game.prototype._autopilotInput = function () {
    var p = this.physics;
    var target = null;
    var landing = false;
    var next = this.rings.nextRing();
    if (next) {
      target = next.center;
    } else {
      landing = true;
      target = new THREE.Vector3(cfg.strips.far.x, 0, cfg.strips.far.z);
    }
    var dx = target.x - p.pos.x;
    var dy = target.y - p.pos.y;
    var dz = target.z - p.pos.z;
    var dist = Math.sqrt(dx * dx + dz * dz);
    var desiredHeading = Math.atan2(-dx, -dz);
    var headingErr = util.angleDelta(p.heading, desiredHeading);
    // Bank INTO the turn: a positive heading error (target to the left,
    // heading must increase) needs a left bank, which is a negative roll.
    var rollCmd = util.clamp(-headingErr * 1.5, -1, 1);
    var pitchCmd = 0;
    var throttleCmd = 0.62;
    var terrainH = EMBER2.terrain.heightAt(p.pos.x, p.pos.z);
    var agl = p.pos.y - EMBER2.GEAR_HEIGHT - terrainH;
    if (landing) {
      // Lateral: hold the strip centreline, heading north (the strip's
      // heading). Steering at the strip centre as a point makes the plane
      // chase a target it flies past and then turn around over the runway;
      // holding the centreline keeps it flying straight down the strip.
      var farStrip = cfg.strips.far;
      var latErr = p.pos.x - farStrip.x;
      var desiredHeading = util.clamp(latErr * 0.004, -0.5, 0.5);
      var headingErrLand = util.angleDelta(p.heading, desiredHeading);
      rollCmd = util.clamp(-headingErrLand * 2.2, -0.4, 0.4);
      // Vertical: a cascaded glide-slope controller. The outer loop turns
      // the altitude error against the slope into a target descent rate
      // (fast when high, gentle near the ground — the flare is built in,
      // not a separate bang-bang branch, so the plane cannot porpoise
      // around a flare threshold). The inner loop turns the vertical-speed
      // error into pitch.
      var touchdownZ = farStrip.z + 150;
      var distTD = Math.max(0, p.pos.z - touchdownZ);
      var glideAlt = util.clamp(distTD * 0.055, 0, 120);
      var altErr = glideAlt - p.pos.y;
      // Feed the slope's own descent rate forward: the glide target sinks
      // at 5.5% of ground speed, so holding it needs that descent rate even
      // when the altitude error is zero (without it the plane levels off
      // on the slope and floats past the strip). The altitude error only
      // corrects the rate up or down from there.
      var vsTarget = util.clamp(-0.055 * p.speed + altErr * 0.2, -4.5, 2.0);
      pitchCmd = util.clamp(((vsTarget - p.vs) * 0.06) / cfg.flight.maxPitch, -1, 1);
      throttleCmd = agl > 60 ? 0.42 : 0.3;
    } else {
      pitchCmd = util.clamp((Math.atan2(dy, Math.max(60, dist)) * 1.6) / cfg.flight.maxPitch, -1, 1);
      throttleCmd = 0.62;
    }
    return { pitch: pitchCmd, roll: rollCmd, throttleSet: throttleCmd, brake: false, throttleUp: false, throttleDown: false, wind: null };
  };

  Game.prototype._manualInput = function () {
    var keys = cfg.keys;
    var input = this.input;
    var pitch = 0;
    var roll = 0;
    if (input.isDownAny(keys.pitchUp)) pitch += 1;
    if (input.isDownAny(keys.pitchDown)) pitch -= 1;
    if (input.isDownAny(keys.bankRight)) roll += 1;
    if (input.isDownAny(keys.bankLeft)) roll -= 1;
    var stick = input.stick();
    pitch += stick.y;
    roll += stick.x;
    return {
      pitch: util.clamp(pitch, -1, 1),
      roll: util.clamp(roll, -1, 1),
      throttleUp: input.isDownAny(keys.throttleUp),
      throttleDown: input.isDownAny(keys.throttleDown),
      throttleSet: null,
      brake: input.isDownAny(keys.brake),
      wind: null,
    };
  };

  Game.prototype.update = function (dt) {
    var wind = this._windNow();
    this.sky.update(dt);
    this.terrain.update(dt, this.time, this.physics.pos, this.windHeading, wind.speed);
    if (this.state === 'title') {
      // A slow drift over the valley behind the title.
      this.physics.pos.z -= 6 * dt;
      if (this.physics.pos.z < -800) this._stageTitleScene();
      this._updateAircraft();
      this._updateCamera(dt, false);
      this.rings.update(dt, this.time);
      return;
    }
    if (this.state !== 'flying') {
      this.rings.update(dt, this.time);
      return;
    }
    this.elapsed = this.time - this.sortieStartTime;
    var input = this.autopilot ? this._autopilotInput() : this._manualInput();
    input.wind = { x: wind.x, z: wind.z };
    // Fixed-timestep physics: a slow frame (SwiftShader, or any hitch)
    // must not slow game time, so the flight model advances in 1/60 s
    // substeps, up to 12 a frame, and the ring check runs per substep.
    var STEP = 1 / 60;
    this._acc = (this._acc || 0) + dt;
    if (this._acc > 0.3) this._acc = 0.3;
    var event = null;
    var substeps = 0;
    while (this._acc >= STEP && substeps < 12 && !event) {
      var prevPos = this.physics.pos.clone();
      event = this.physics.step(STEP, input, EMBER2.terrain);
      // Rings: crossing the next ring's plane inside its radius.
      var passed = this.rings.checkPass(prevPos, this.physics.pos);
      if (passed) {
        var speedBonus = Math.round(cfg.scoring.ringSpeedBonus * util.clamp((this.physics.speed - 30) / 50, 0, 1));
        var points = cfg.scoring.ringBase + speedBonus;
        this.sortieScore += points;
        this.score += points;
        this.ringsFlown = this.rings.flownCount();
        this.physics.fuel = Math.min(100, this.physics.fuel + cfg.sorties[this.sortieIndex].fuelPerRing);
        this.audio.ringChime(this.ringsFlown);
        this.hud.message('RING ' + this.ringsFlown + '  +' + points + '   FUEL +' + cfg.sorties[this.sortieIndex].fuelPerRing, 1.8);
        this.hud.flash('RING ' + this.ringsFlown, 1.1);
      }
      this._acc -= STEP;
      substeps++;
    }
    // Fuel warnings and stall callouts.
    if (this.physics.fuel < 20 && Math.floor(this.time * 2) % 2 === 0) {
      this.hud.message('LOW FUEL — ' + Math.round(this.physics.fuel) + ' LEFT', 0.6);
    }
    if (this.physics.stalled) {
      this.hud.flash('STALL', 0.7);
    }
    // Flare callout on short final.
    var terrainH = EMBER2.terrain.heightAt(this.physics.pos.x, this.physics.pos.z);
    var agl = this.physics.pos.y - EMBER2.GEAR_HEIGHT - terrainH;
    if (this.rings.allFlown() && !this.physics.onGround && agl < 32 && agl > 14 && this.physics.vs < -1) {
      this.hud.flash('FLARE', 0.8);
    }
    if (event === 'landed') {
      this._onLanded();
    } else if (event === 'crash-terrain') {
      this._onCrashed('TERRAIN STRIKE');
    } else if (event === 'crash-landing') {
      this._onCrashed('HARD LANDING');
    } else if (this.physics.fuel <= 0 && !this.physics.onGround && this.physics.speed < 18) {
      this._onCrashed('OUT OF FUEL');
    }
    this._updateAircraft();
    this._updateCamera(dt, false);
    this.rings.update(dt, this.time);
    this.aircraft.update(dt, this.physics.throttle, this.physics.speed);
    this.audio.update(this.physics.throttle, this.physics.speed, cfg.flight.maxSpeed);
    this.hud.update(dt, this._hudState(wind));
    this.input.endFrame();
  };

  Game.prototype._hudState = function (wind) {
    var next = this.rings.nextRing();
    var target = null;
    var targetIsStrip = false;
    if (next) {
      target = next.center;
    } else {
      target = new THREE.Vector3(cfg.strips.far.x, 0, cfg.strips.far.z);
      targetIsStrip = true;
    }
    var terrainH = EMBER2.terrain.heightAt(this.physics.pos.x, this.physics.pos.z);
    var ringPositions = [];
    for (var i = 0; i < this.rings.list.length; i++) {
      var r = this.rings.list[i];
      ringPositions.push({ x: r.center.x, z: r.center.z, flown: r.flown });
    }
    return {
      physics: this.physics,
      ringsFlown: this.ringsFlown,
      ringsTotal: this.ringsTotal,
      score: this.score,
      windSpeed: wind.speed * 1.94,
      windDirText: this._windDirText(),
      agl: Math.max(0, this.physics.pos.y - EMBER2.GEAR_HEIGHT - terrainH),
      target: target,
      targetIsStrip: targetIsStrip,
      ringPositions: ringPositions,
      minimap: { x0: -2600, x1: 2600, z0: 1100, z1: -12100 },
    };
  };

  Game.prototype._updateAircraft = function () {
    var p = this.physics;
    this.aircraft.setState(p.pos, p.heading, p.pitch, p.roll);
  };

  Game.prototype._updateCamera = function (dt, snap) {
    var p = this.physics;
    var forward = new THREE.Vector3(-Math.sin(p.heading), 0, -Math.cos(p.heading));
    if (this.cameraMode === 'cockpit') {
      // Wider lens in the cockpit, so the frame reads as a cockpit
      // (panel at the bottom, pillars at the sides) without swallowing
      // the view ahead.
      if (this.camera.fov !== 72) {
        this.camera.fov = 72;
        this.camera.updateProjectionMatrix();
      }
      var ct = this.aircraft.cockpitTransform();
      this.camera.position.copy(ct.position);
      this.camera.quaternion.copy(ct.quaternion);
      return;
    }
    if (this.camera.fov !== 62) {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
    var desired = new THREE.Vector3();
    var lookAt = new THREE.Vector3();
    if (this.cameraMode === 'high') {
      desired.copy(p.pos).addScaledVector(forward, -38).add(new THREE.Vector3(0, 58, 0));
      lookAt.copy(p.pos).addScaledVector(forward, 20);
    } else {
      desired.copy(p.pos).addScaledVector(forward, -15).add(new THREE.Vector3(0, 4.6, 0));
      lookAt.copy(p.pos).addScaledVector(forward, 26).add(new THREE.Vector3(0, 0.5, 0));
    }
    var groundH = EMBER2.terrain.heightAt(desired.x, desired.z);
    if (desired.y < groundH + 2.5) desired.y = groundH + 2.5;
    if (snap || this.cameraSnapped === false) {
      this.camera.position.copy(desired);
      this.cameraSnapped = true;
    } else {
      var k = 1 - Math.pow(0.0001, dt);
      this.camera.position.lerp(desired, k);
    }
    this.camera.lookAt(lookAt);
  };

  Game.prototype._onLanded = function () {
    var p = this.physics;
    var sortie = cfg.sorties[this.sortieIndex];
    var strip = cfg.strips.far;
    var soft = Math.abs(p.vs) < 2;
    var centred = Math.abs(p.pos.x - strip.x) < 8;
    var timeBonus = Math.max(0, Math.round((sortie && cfg.scoring.parTime[this.sortieIndex] - this.elapsed) * cfg.scoring.timeBonusPerSecond));
    var fuelBonus = Math.round(p.fuel * cfg.scoring.fuelBonusPerUnit);
    var landingPoints =
      cfg.scoring.landingBase +
      (soft ? cfg.scoring.landingSoftBonus : 0) +
      (centred ? cfg.scoring.landingCentreBonus : 0) +
      fuelBonus +
      timeBonus;
    this.sortieScore += landingPoints;
    this.score += landingPoints;
    this.landingInfo = { soft: soft, centred: centred, fuelBonus: fuelBonus, timeBonus: timeBonus, points: landingPoints };
    this.audio.thud();
    var title = soft ? 'GREASED IT' : 'DOWN SAFE';
    this._endScreen(title, this._landingBreakdown(), this.sortieIndex < cfg.sorties.length - 1 ? 'ENTER — NEXT SORTIE' : 'ENTER — CAMPAIGN RESULTS');
    this.state = 'landed';
  };

  Game.prototype._landingBreakdown = function () {
    var info = this.landingInfo;
    var sortie = cfg.sorties[this.sortieIndex];
    var lines = [
      sortie.name.toUpperCase() + ' COMPLETE',
      'Rings ' + this.ringsFlown + '/' + this.ringsTotal,
      'Landing +' + cfg.scoring.landingBase +
        (info.soft ? '  ·  Soft +' + cfg.scoring.landingSoftBonus : '') +
        (info.centred ? '  ·  Centreline +' + cfg.scoring.landingCentreBonus : ''),
      'Fuel bonus +' + info.fuelBonus + '  ·  Time bonus +' + info.timeBonus,
      'Sortie score ' + this.sortieScore + '   ·   Total ' + this.score,
      'Time ' + util.formatTime(this.elapsed) + '  ·  Par ' + util.formatTime(cfg.scoring.parTime[this.sortieIndex]),
    ];
    return lines.join('\n');
  };

  Game.prototype._onCrashed = function (reason) {
    this.crashReason = reason;
    this.audio.crash();
    var body = [
      cfg.sorties[this.sortieIndex].name.toUpperCase(),
      'Rings ' + this.ringsFlown + '/' + this.ringsTotal + '   ·   Score ' + this.score,
      reason === 'TERRAIN STRIKE'
        ? 'The valley wall does not forgive. Watch the terrain, not just the ring.'
        : reason === 'OUT OF FUEL'
          ? 'The tank ran dry over the valley. Rings pay fuel — fly them.'
          : 'Too fast, too hard, or too banked for the strip. Slow down, level out.',
    ].join('\n');
    this._endScreen(reason, body, 'ENTER — FLY IT AGAIN');
    this.state = 'crashed';
  };

  Game.prototype._endScreen = function (title, body, hint) {
    if (this._els['end-title']) this._els['end-title'].textContent = title;
    if (this._els['end-body']) this._els['end-body'].textContent = body;
    if (this._els['end-hint']) this._els['end-hint'].textContent = hint;
    this._show('end');
  };

  Game.prototype._showCampaign = function () {
    this.state = 'campaign';
    var body = [
      'EMBER VALLEY COMPLETE',
      'All three sorties flown. Rings ' + this.ringsFlown + '/' + this.ringsTotal + ' on the last leg.',
      'Total score ' + this.score,
      'The Kestrel is parked, the valley is quiet, and the mail got through.',
    ].join('\n');
    this._endScreen('CAMPAIGN COMPLETE', body, 'ENTER — BACK TO THE TITLE');
  };

  EMBER2.Game = Game;
})();
