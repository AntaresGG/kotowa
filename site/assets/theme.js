// Run before CSS to restore the appearance without a flash of the default theme.
(function () {
  'use strict';
  var key = 'kotowa:appearance';
  var root = document.documentElement;
  function apply(value) {
    var theme = value === 'silver-era' ? 'silver-era' : value === 'theme2' ? 'theme2' : 'theme1';
    root.dataset.appearance = theme;
    var toggle = document.getElementById('theme-switch');
    if (toggle) toggle.setAttribute('aria-checked', String(theme === 'theme2'));
    var silver = document.getElementById('theme-silver');
    if (silver) silver.setAttribute('aria-pressed', String(theme === 'silver-era'));
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'silver-era' ? '#dedbd3' : theme === 'theme2' ? '#4b16cf' : '#d7263d';
    document.dispatchEvent(new CustomEvent('kotowa:appearance', { detail: { theme: theme } }));
  }
  var saved;
  try { saved = localStorage.getItem(key); } catch (err) { /* storage blocked */ }
  apply(saved);
  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('theme-switch');
    if (!toggle) return;
    apply(root.dataset.appearance);
    function choose(theme) {
      apply(theme);
      try { localStorage.setItem(key, theme); } catch (err) { /* session-only choice */ }
    }
    document.getElementById('theme-silver').addEventListener('click', function () { choose('silver-era'); });
    var startX = null;
    var dragged = false;
    toggle.addEventListener('pointerdown', function (event) {
      if (!event.isPrimary || event.button !== 0) return;
      startX = event.clientX;
      dragged = false;
      toggle.setPointerCapture(event.pointerId);
    });
    toggle.addEventListener('pointerup', function (event) {
      if (startX === null) return;
      var distance = event.clientX - startX;
      startX = null;
      if (Math.abs(distance) > 12) {
        dragged = true;
        choose(distance > 0 ? 'theme2' : 'theme1');
      }
    });
    toggle.addEventListener('pointercancel', function () { startX = null; dragged = false; });
    toggle.addEventListener('click', function (event) {
      if (dragged && event.detail !== 0) { dragged = false; return; }
      dragged = false;
      if (root.dataset.appearance === 'silver-era') {
        var box = toggle.getBoundingClientRect();
        choose(event.detail !== 0 && event.clientX > box.left + box.width / 2 ? 'theme2' : 'theme1');
        return;
      }
      choose(root.dataset.appearance === 'theme2' ? 'theme1' : 'theme2');
    });
    toggle.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        choose(event.key === 'ArrowRight' ? 'theme2' : 'theme1');
      }
    });
  });
  window.addEventListener('storage', function (event) {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
