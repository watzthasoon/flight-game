// EMBERWING II — Ember Valley. Boot: waits for the document, checks for
// WebGL, and hands over to the game. All the game's own scripts are classic
// scripts loaded in the head, so this runs last and the DOM is ready.

(function () {
  'use strict';

  function boot() {
    if (!window.THREE) {
      var fatal = document.getElementById('fatal');
      if (fatal) fatal.classList.remove('hidden');
      return;
    }
    try {
      var game = new window.EMBER2.Game();
      game.boot();
    } catch (err) {
      if (window.console && console.error) console.error('emberwing II boot failed', err);
      var fatalBox = document.getElementById('fatal');
      if (fatalBox) fatalBox.classList.remove('hidden');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
