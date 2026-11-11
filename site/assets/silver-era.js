// Presentation and reading controls for the Silver Era receiver. Study data stays in flashcards.js.
(function () {
  'use strict';
  var t = KotowaI18n.t;
  var lastStudy = null;
  var root = document.documentElement;
  var meters = ['se-meter-left', 'se-meter-right'].map(function (id) { return document.getElementById(id); });
  var readings = new Map();
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var size = document.getElementById('se-text-size');
  var sizes = ['Small', 'Standard', 'Large'];
  var sizeKey = 'kotowa:silver:text-size';
  var panelKey = 'kotowa:silver:panel';
  var panel = document.getElementById('se-faceplate');
  var panelToggle = document.getElementById('se-panel-toggle');
  var context = document.getElementById('se-context');
  if (!size || !meters[0]) return;

  function setSize(value) {
    var index = ['0', '1', '2'].includes(String(value)) ? Number(value) : 1;
    size.value = String(index);
    size.setAttribute('aria-valuetext', t(sizes[index]));
    size.removeAttribute('data-i18n-aria-valuetext');
    KotowaI18n.text(document.getElementById('se-size-label'), sizes[index]);
    root.dataset.silverSize = String(index);
    root.style.setProperty('--se-dial-angle', (index - 1) * 42 + 'deg');
  }
  try { setSize(localStorage.getItem(sizeKey)); } catch (e) { setSize(1); }
  size.addEventListener('input', function () {
    setSize(size.value);
    try { localStorage.setItem(sizeKey, size.value); } catch (e) { /* storage blocked */ }
  });
  function setPanel(value) {
    panel.hidden = value === 'closed';
    panelToggle.setAttribute('aria-expanded', String(!panel.hidden));
    KotowaI18n.text(panelToggle, panel.hidden ? 'Expand panel' : 'Collapse panel');
    enterTheme();
  }
  try { setPanel(localStorage.getItem(panelKey)); } catch (e) { setPanel('open'); }
  panelToggle.addEventListener('click', function () {
    setPanel(panel.hidden ? 'open' : 'closed');
    try { localStorage.setItem(panelKey, panel.hidden ? 'closed' : 'open'); } catch (e) { /* storage blocked */ }
  });
  window.addEventListener('storage', function (event) {
    if (event.key === sizeKey || event.key === null) setSize(event.newValue);
    if (event.key === panelKey || event.key === null) setPanel(event.newValue);
  });

  function stop(needle) {
    needle.getAnimations().forEach(function (animation) { animation.cancel(); });
  }
  function sweep(meter, angle, changed) {
    var needle = meter.querySelector('.se-needle');
    var start = getComputedStyle(needle).transform;
    stop(needle);
    meter.style.setProperty('--needle-angle', angle + 'deg');
    if (root.dataset.appearance !== 'silver-era' || panel.hidden || motion.matches || !changed) return;
    needle.animate([
      { transform: start, offset: 0 },
      { transform: 'rotate(-55deg)', offset: 0.12 },
      { transform: 'rotate(55deg)', offset: 0.43 },
      { transform: 'rotate(-55deg)', offset: 0.68 },
      { transform: 'rotate(' + angle + 'deg)', offset: 1 }
    ], { duration: 2600, easing: 'ease-in-out' });
  }
  function reading(meter, value, signature, description) {
    var previous = readings.get(meter.id);
    var maximum = Number(meter.getAttribute('aria-valuemax'));
    var ratio = Math.max(0, Math.min(1, value / maximum));
    meter.setAttribute('aria-valuenow', String(Math.round(value * 10) / 10));
    meter.removeAttribute('data-i18n-aria-valuetext');
    meter.setAttribute('aria-valuetext', description);
    meter.dataset.reading = String(value);
    meter.parentElement.querySelector('output').textContent = maximum === 100
      ? Number(value.toFixed(1)) + '%' : value.toLocaleString('en-US');
    readings.set(meter.id, signature);
    sweep(meter, -55 + ratio * 110, previous !== signature);
  }
  function clearMeters(message, loading) {
    document.getElementById('se-meters').setAttribute('aria-busy', String(loading));
    context.removeAttribute('data-i18n');
    context.textContent = message;
    meters.forEach(function (meter) {
      readings.delete(meter.id);
      meter.dataset.reading = '';
      meter.removeAttribute('aria-valuenow');
      meter.removeAttribute('data-i18n-aria-valuetext');
      meter.setAttribute('aria-valuetext', message);
      meter.parentElement.querySelector('output').textContent = '—';
      sweep(meter, -55, false);
    });
  }
  function renderStudy(data) {
    if (data.loading || data.error) {
      clearMeters(t(data.error ? 'Deck could not load. Please select it again.' : 'Loading deck…'), !!data.loading);
      return;
    }
    document.getElementById('se-meters').setAttribute('aria-busy', 'false');
    // Signatures include raw counts, so a changed reading still sweeps when rounded percentages match.
    reading(meters[0], data.studiedPercent, data.deck + ':' + data.studied + '/' + data.total,
      t('{studied} of {total} studied (self-rated)', { studied: data.studied, total: data.total }));
    reading(meters[1], data.sessionPercent, data.deck + ':' + data.mode + ':' + data.done + '/' + data.sessionTotal,
      t('{done} of {total} completed this session', { done: data.done, total: data.sessionTotal }));
    context.removeAttribute('data-i18n');
    context.textContent = t('{deck} · {total} cards · {mode}', { deck: data.deck, total: data.total, mode: t(data.mode === 'focus' ? 'Focused review' : 'Daily review') });
  }
  document.addEventListener('kotowa:study', function (event) {
    lastStudy = event.detail;
    renderStudy(lastStudy);
  });
  document.addEventListener('kotowa:language', function () {
    setSize(size.value);
    KotowaI18n.text(panelToggle, panel.hidden ? 'Expand panel' : 'Collapse panel');
    if (lastStudy) renderStudy(lastStudy);
  });
  function enterTheme() {
    if (root.dataset.appearance !== 'silver-era' || panel.hidden) {
      meters.forEach(function (meter) { stop(meter.querySelector('.se-needle')); });
      return;
    }
    meters.forEach(function (meter) {
      if (meter.dataset.reading === '') return;
      var value = Number(meter.dataset.reading);
      var max = Number(meter.getAttribute('aria-valuemax'));
      sweep(meter, -55 + value / max * 110, true);
    });
  }
  document.addEventListener('kotowa:appearance', enterTheme);
  motion.addEventListener('change', function () {
    if (motion.matches) meters.forEach(function (meter) { stop(meter.querySelector('.se-needle')); });
  });
})();
