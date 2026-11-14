// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// theme.js: dark / light theme. Dark is the default; the choice is kept in localStorage.
// Loaded in <head> so the page never flashes in the wrong theme.

(function () {
  'use strict';

  var KEY = 'sera-theme';
  var root = document.documentElement;

  function stored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(t) {
    try { localStorage.setItem(KEY, t); } catch (e) { /* private mode: theme still works */ }
  }

  var theme = stored() === 'light' ? 'light' : 'dark';
  root.setAttribute('data-theme', theme);

  function syncButtons() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      var next = theme === 'dark' ? 'light' : 'dark';
      buttons[i].setAttribute('aria-label', 'Switch to ' + next + ' theme');
      buttons[i].setAttribute('title', 'Switch to ' + next + ' theme');
      buttons[i].setAttribute('data-current', theme);
    }
  }

  function setTheme(t) {
    theme = t;
    root.setAttribute('data-theme', t);
    save(t);
    syncButtons();
    document.dispatchEvent(new CustomEvent('sera-theme', { detail: t }));
  }

  document.addEventListener('DOMContentLoaded', function () {
    syncButtons();
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
      if (btn) setTheme(theme === 'dark' ? 'light' : 'dark');
    });
    // Turn on colour transitions only after the first paint.
    requestAnimationFrame(function () { root.classList.add('theme-ready'); });
  });

  window.SeraTheme = { get: function () { return theme; }, set: setTheme };
})();
