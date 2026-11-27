// EMBERWING II — Ember Valley. Every number the game is tuned by lives here:
// the three sorties, the valley's shape, the flight model, the palette and the
// keys. No other file hard-codes a mission value; change it here.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});

  EMBER2.config = {
    // The valley runs north, along -Z. The home strip sits at z = 120, the
    // far strip at z = -11000, both on the valley floor (y ~ 0).
    valley: {
      halfWidth: 2600,          // terrain spans x in [-2600, 2600]
      zNear: 1100,              // terrain extends a little south of home
      zFar: -12100,             // and a little past the far strip
      floorHalf: 300,           // valley floor stays flat inside |d| < 300
      wallTop: 1500,            // canyon walls crest around |d| = 1500
      wallHeight: 540,          // wall crest height in metres
      plateauHeight: 620,       // rolling plateau beyond the walls
      seed: 20261127,
    },
    // The river meanders down the valley floor; rings follow it.
    river: {
      amp1: 180, freq1: 0.00042,
      amp2: 95, freq2: 0.0011,
      width: 64,
    },
    strips: {
      home: { x: 0, z: 120, heading: 0, length: 620, width: 42 },
      far: { x: 0, z: -11000, heading: 0, length: 680, width: 46 },
    },
    // One sortie = one flight down the valley. Rings sit along the river;
    // lateral and height offsets are seeded per sortie.
    sorties: [
      {
        id: 0, name: 'Ember Dawn', desc: '6 rings · gentle wind · generous fuel',
        rings: 6, ringRadius: 30, fuel: 100, fuelPerRing: 9,
        wind: 2.0, gust: 1.0, timeOfDay: 'dusk', cloudCover: 0.5,
      },
      {
        id: 1, name: 'Ridge Runner', desc: '10 rings · crosswind gusts · tighter fuel',
        rings: 10, ringRadius: 26, fuel: 92, fuelPerRing: 7,
        wind: 5.0, gust: 2.6, timeOfDay: 'dusk', cloudCover: 0.65,
      },
      {
        id: 2, name: 'Night Mail', desc: '12 rings · night · narrow gaps · thin fuel',
        rings: 12, ringRadius: 23, fuel: 84, fuelPerRing: 6,
        wind: 7.0, gust: 3.4, timeOfDay: 'night', cloudCover: 0.4,
      },
    ],
    // Flight model tuning (metres, seconds, metres per second).
    flight: {
      maxSpeed: 88,             // level-flight top speed at full throttle
      stallSpeed: 26,           // below this the wing stops answering
      minSpeed: 12,             // the plane never flies slower than this in the air
      thrustAccel: 9.5,         // forward acceleration at full throttle
      dragBase: 0.0013,         // quadratic drag: full throttle balances near 85 m/s
      dragTurn: 0.03,           // extra drag while banked hard
      rollRate: 1.9,            // radians per second of bank authority
      pitchRate: 1.15,          // radians per second of pitch authority
      maxBank: 1.05,            // about 60 degrees
      maxPitch: 0.5,            // about 29 degrees
      turnAuthority: 1.5,       // scales how fast bank turns the heading
      climbFactor: 0.9,         // how much of pitch becomes climb
      sinkAtStall: 9,           // metres per second lost when stalled
      groundEffect: 6,          // metres above ground where lift feels cushioned
      fuelBurnIdle: 0.10,       // fuel per second at idle
      fuelBurnFull: 0.62,       // fuel per second at full throttle
      brakeDecel: 14,           // airbrake deceleration on the ground
      brakeAir: 22,             // airbrake deceleration in the air
      landMaxVs: 4.2,           // max sink rate for a safe touchdown (m/s)
      landMaxSpeed: 58,         // max speed for a safe touchdown (m/s)
      landMaxBank: 0.30,        // max bank for a safe touchdown (rad)
      takeoffSpeed: 30,         // rotate speed on the runway (m/s)
    },
    scoring: {
      ringBase: 100,            // points per ring
      ringSpeedBonus: 60,       // extra for flying the ring fast
      landingBase: 300,         // points for putting her down
      landingSoftBonus: 200,    // extra for a gentle touchdown
      landingCentreBonus: 100,  // extra for the centreline
      fuelBonusPerUnit: 4,      // points per fuel unit left at landing
      timeBonusPerSecond: 2,    // points per second under the sortie par time
      parTime: [300, 330, 360], // par times per sortie, seconds
    },
    palette: {
      skyTopDusk: 0x2a2350,
      skyHorizonDusk: 0xff8c42,
      skyTopNight: 0x070a1c,
      skyHorizonNight: 0x3a1c44,
      sun: 0xffd9a0,
      fogDusk: 0xc97a4a,
      fogNight: 0x1a1428,
      sand: 0xc98f5f,
      rock: 0x7a4a38,
      scrub: 0x55603c,
      river: 0x2e6b7a,
      liveryCream: 0xf2e6c9,
      liveryEmber: 0xe86a2c,
      liveryDark: 0x2a2a33,
      ring: 0xffb347,
      ringCore: 0xff7b00,
      runway: 0x2e2c33,
    },
    keys: {
      throttleUp: ['KeyW'],
      throttleDown: ['KeyS'],
      pitchUp: ['ArrowUp'],
      pitchDown: ['ArrowDown'],
      bankLeft: ['KeyA', 'ArrowLeft'],
      bankRight: ['KeyD', 'ArrowRight'],
      brake: ['Space'],
      camera: ['KeyC'],
      pause: ['KeyP', 'Escape'],
      mute: ['KeyM'],
      restart: ['KeyR'],
      confirm: ['Enter'],
    },
  };
})();
