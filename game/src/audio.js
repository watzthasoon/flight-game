// EMBERWING — Canyon Courier. Every sound is synthesised with WebAudio: the
// engine is two oscillators through a low-pass filter with a propeller chop,
// the wind is filtered noise, and the chimes and alarms are plain sine and
// square voices. No audio files, nothing fetched. The context is created on
// the first user gesture, as browsers require.

(function () {
  'use strict';

  var EMBER = window.EMBER || (window.EMBER = {});

  var ctx = null;
  var master = null;
  var engineOsc = null;
  var engineSub = null;
  var engineFilter = null;
  var engineGain = null;
  var windSource = null;
  var windFilter = null;
  var windGain = null;
  var muted = false;
  var started = false;

  function ensureContext() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (err) {
      // Headless or locked-down browsers may refuse an AudioContext; the
      // game plays on silently instead of breaking.
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);

    // Engine: a sawtooth plus a low sine an octave down, through a low-pass.
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 1.2;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineFilter.connect(engineGain);
    engineGain.connect(master);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 68;
    engineOsc.connect(engineFilter);
    engineSub = ctx.createOscillator();
    engineSub.type = 'sine';
    engineSub.frequency.value = 34;
    engineSub.connect(engineFilter);
    engineOsc.start();
    engineSub.start();

    // Propeller chop: an 11 Hz LFO breathing on the engine gain.
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 11;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain);
    lfoGain.connect(engineGain.gain);
    lfo.start();

    // Wind: a looped white-noise buffer through a band-pass.
    var length = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    windSource = ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSource.start();

    started = true;
    return true;
  }

  // Called every frame while flying: throttle 0..1, speed in m/s.
  function update(throttle, speed, flying) {
    if (!ctx || !started) return;
    if (ctx.state === 'suspended') ctx.resume();
    var now = ctx.currentTime;
    var rpm = 0.35 + throttle * 0.65;
    engineOsc.frequency.setTargetAtTime(58 + throttle * 96, now, 0.08);
    engineSub.frequency.setTargetAtTime(29 + throttle * 48, now, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + throttle * 900, now, 0.1);
    engineGain.gain.setTargetAtTime(flying ? 0.10 + throttle * 0.16 : 0.05, now, 0.1);
    var windLevel = flying ? Math.min(1, speed / 90) : 0;
    windGain.gain.setTargetAtTime(windLevel * 0.14, now, 0.15);
    windFilter.frequency.setTargetAtTime(320 + speed * 9, now, 0.15);
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ctx || !started) return;
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function ring() {
    tone(659.25, 0.5, 'sine', 0.22, 0);
    tone(987.77, 0.7, 'sine', 0.18, 0.09);
    tone(1318.5, 0.4, 'sine', 0.08, 0.18);
  }

  function alarm() {
    tone(880, 0.16, 'square', 0.10, 0);
    tone(880, 0.16, 'square', 0.10, 0.22);
  }

  function thud() {
    if (!ctx || !started) return;
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
    gain.gain.setValueAtTime(0.5, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.35);
  }

  function jingle() {
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], 0.55, 'sine', 0.18, i * 0.13);
    }
  }

  function click() {
    tone(1200, 0.06, 'sine', 0.12, 0);
  }

  function setMuted(value) {
    muted = !!value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    return muted;
  }

  function isMuted() {
    return muted;
  }

  EMBER.audio = {
    ensure: ensureContext,
    update: update,
    ring: ring,
    alarm: alarm,
    thud: thud,
    jingle: jingle,
    click: click,
    setMuted: setMuted,
    isMuted: isMuted,
  };
})();
