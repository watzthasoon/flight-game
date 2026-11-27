// EMBERWING II — Ember Valley. Keyboard and mouse, in one place. Keys are
// read by code name (KeyW, ArrowUp, ...) so any layout works, and a held
// mouse button turns the pointer into a stick: drag to bank and pitch.

(function () {
  'use strict';

  var EMBER2 = window.EMBER2 || (window.EMBER2 = {});
  var util = EMBER2.util;

  function Input(canvas) {
    this.keys = {};
    this.pressed = {};
    this.mouseDown = false;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.canvas = canvas || null;
    this.onFirstGesture = null;
    this._gestured = false;
    this._attach();
  }

  Input.prototype._markGesture = function () {
    if (!this._gestured) {
      this._gestured = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  };

  Input.prototype._attach = function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      self._markGesture();
      if (e.repeat) return;
      self.keys[e.code] = true;
      self.pressed[e.code] = true;
      // Keep the page from scrolling while flying.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });
    window.addEventListener('blur', function () {
      self.keys = {};
      self.mouseDown = false;
    });
    if (this.canvas) {
      this.canvas.addEventListener('mousedown', function (e) {
        self._markGesture();
        self.mouseDown = true;
        self.mouseX = e.clientX;
        self.mouseY = e.clientY;
        self.mouseDX = 0;
        self.mouseDY = 0;
      });
      window.addEventListener('mouseup', function () {
        self.mouseDown = false;
        self.mouseDX = 0;
        self.mouseDY = 0;
      });
      window.addEventListener('mousemove', function (e) {
        if (!self.mouseDown) return;
        self.mouseDX = util.clamp((e.clientX - self.mouseX) / 160, -1, 1);
        self.mouseDY = util.clamp((e.clientY - self.mouseY) / 160, -1, 1);
      });
    }
  };

  // True only on the frame the key went down (for menus and toggles).
  Input.prototype.wasPressed = function (code) {
    return !!this.pressed[code];
  };

  Input.prototype.isDown = function (code) {
    return !!this.keys[code];
  };

  Input.prototype.isDownAny = function (codes) {
    for (var i = 0; i < codes.length; i++) {
      if (this.keys[codes[i]]) return true;
    }
    return false;
  };

  Input.prototype.wasPressedAny = function (codes) {
    for (var i = 0; i < codes.length; i++) {
      if (this.pressed[codes[i]]) return true;
    }
    return false;
  };

  // Stick axes from the mouse drag: x is roll (right positive), y is pitch
  // (drag down pulls the nose up, like a stick). Zero when not dragging.
  Input.prototype.stick = function () {
    if (!this.mouseDown) return { x: 0, y: 0 };
    return { x: this.mouseDX, y: -this.mouseDY };
  };

  // Call once per frame, after the game has read the inputs.
  Input.prototype.endFrame = function () {
    this.pressed = {};
  };

  EMBER2.Input = Input;
})();
