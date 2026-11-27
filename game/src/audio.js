// EMBERWING II — Ember Valley. Every sound is synthesized with WebAudio:
// no audio files, nothing to load. Engine hum follows the throttle, wind
// follows the airspeed, and rings, landings and crashes get their own voice.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.windSource = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
  }

  // Browsers only let audio start after a user gesture; call this from the
  // first key press or click. Safe to call more than once.
  AudioEngine.prototype.ensure = function () {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a lowpass, pitch and gain by throttle.
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 55 * 1.5;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // Wind: looped white noise through a bandpass, gain by airspeed.
    var len = ctx.sampleRate * 2;
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buffer;
    this.windSource.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSource.start();

    this.started = true;
  };

  // Call every frame with the plane's throttle (0..1) and airspeed (m/s).
  AudioEngine.prototype.update = function (throttle, speed, maxSpeed) {
    if (!this.started || !this.ctx) return;
    var t = this.ctx.currentTime;
    var rpm = 42 + throttle * 78;
    this.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 1.494, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.02 + throttle * 0.085, t, 0.1);
    var windLevel = util.clamp(speed / maxSpeed, 0, 1);
    this.windFilter.frequency.setTargetAtTime(420 + speed * 14, t, 0.1);
    this.windGain.gain.setTargetAtTime(windLevel * windLevel * 0.16, t, 0.15);
  };

  AudioEngine.prototype.setMuted = function (muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  };

  AudioEngine.prototype.blip = function (freq, dur, type, vol) {
    if (!this.started || !this.ctx || this.muted) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  };

  // A ring flown: a bright little arpeggio, up the scale with each ring.
  AudioEngine.prototype.ringChime = function (ringIndex) {
    if (!this.started || !this.ctx || this.muted) return;
    var base = 523.25 * Math.pow(1.059463, (ringIndex % 12));
    var notes = [base, base * 1.25, base * 1.5];
    for (var i = 0; i < notes.length; i++) {
      this._noteAt(notes[i], i * 0.07, 0.35, 'sine', 0.14);
    }
  };

  AudioEngine.prototype._noteAt = function (freq, delay, dur, type, vol) {
    var ctx = this.ctx;
    var t0 = ctx.currentTime + delay;
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };

  // Touchdown: a soft low thud.
  AudioEngine.prototype.thud = function () {
    if (!this.started || !this.ctx || this.muted) return;
    var ctx = this.ctx;
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.18);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  };

  // Crash: a burst of noise and a low boom.
  AudioEngine.prototype.crash = function () {
    if (!this.started || !this.ctx || this.muted) return;
    var ctx = this.ctx;
    var len = ctx.sampleRate * 0.5;
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    var gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    var osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.5);
    var og = ctx.createGain();
    og.gain.setValueAtTime(0.4, ctx.currentTime);
    og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.connect(og);
    og.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  };

  AudioEngine.prototype.uiClick = function () {
    this.blip(880, 0.08, 'triangle', 0.1);
  };

  EMBER2.AudioEngine = AudioEngine;
})();
