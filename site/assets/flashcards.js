// Flashcards with a small Leitner-style spaced-repetition schedule, stored in localStorage.
(function () {
  'use strict';
  var BOXES = [0, 1, 3, 7, 16, 35]; // days until the next review, per box
  var DAY = 86400000;
  var state = { level: 'N5', kind: 'vocab', deck: [], queue: [], progress: {}, current: null, flipped: false, done: 0, shuffle: false };
  var requestId = 0;

  function storageKey() { return 'openjlpt:fc:' + state.kind + ':' + state.level; }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(storageKey(), JSON.stringify(state.progress)); } catch (e) { /* private mode */ }
  }
  function saveSession() {
    var ids = (state.current ? [state.current] : []).concat(state.queue).map(function (row) { return row[0]; });
    try {
      localStorage.setItem(storageKey() + ':session', JSON.stringify({ day: new Date().toDateString(), ids: ids, done: state.done, flipped: state.flipped, shuffle: state.shuffle }));
    } catch (e) { /* private mode */ }
  }
  function restoreSession(rows) {
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey() + ':session') || 'null');
      if (!saved || saved.day !== new Date().toDateString() || !Array.isArray(saved.ids) || !Number.isInteger(saved.done) || saved.done < 0) return null;
      var byId = new Map(rows.map(function (row) { return [row[0], row]; }));
      var now = Date.now();
      state.queue = saved.ids.filter(function (id) {
        return byId.has(id) && (!state.progress[id] || state.progress[id].due <= now);
      }).map(function (id) { return byId.get(id); });
      state.done = saved.done;
      return saved;
    } catch (e) { return null; }
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  // Example sentences may carry furigana as {漢字|かんじ}; escape first, then add <ruby>.
  function ruby(s) {
    return esc(s).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>');
  }
  function $(id) { return document.getElementById(id); }

  function start(newSession) {
    var request = ++requestId;
    try { localStorage.setItem('openjlpt:fc:selection', JSON.stringify({ level: state.level, kind: state.kind })); } catch (e) { /* private mode */ }
    state.current = null;
    state.flipped = false;
    $('fc-overview').hidden = true;
    $('fc-status').classList.remove('sr-only');
    $('fc-complete').hidden = true;
    ['fc-again', 'fc-flip', 'fc-good'].forEach(function (id) { $(id).disabled = true; });
    $('fc-card').classList.remove('flipped');
    $('fc-front').textContent = '';
    $('fc-back').textContent = '';
    $('fc-status').textContent = 'Loading…';
    fetch(OpenJLPT.root() + 'data/' + state.kind + '-' + state.level.toLowerCase() + '.json')
      .then(function (r) { if (!r.ok) throw new Error('Could not load deck'); return r.json(); })
      .then(function (rows) {
        if (request !== requestId) return;
        state.deck = rows;
        state.progress = loadProgress();
        var saved = newSession === true ? null : restoreSession(rows);
        if (saved) {
          next();
          if (saved.flipped) flip();
          if (!!saved.shuffle !== state.shuffle) orderRemaining();
          return;
        }
        var now = Date.now();
        var due = [], fresh = [];
        rows.forEach(function (row) {
          var p = state.progress[row[0]];
          if (!p) fresh.push(row);
          else if (p.due <= now) due.push(row);
        });
        if (state.shuffle) { shuffle(due); shuffle(fresh); }
        state.queue = due.concat(fresh.slice(0, Math.max(0, 20 - due.length)));
        state.done = 0;
        next();
      }).catch(function () {
        if (request === requestId) $('fc-status').textContent = 'Unable to load this deck. Select it again to retry.';
      });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  }
  function orderRemaining() {
    if (!state.current) return;
    if (state.shuffle) shuffle(state.queue);
    else {
      var order = new Map(state.deck.map(function (row, i) { return [row[0], i]; }));
      state.queue.sort(function (a, b) { return order.get(a[0]) - order.get(b[0]); });
    }
    saveSession();
  }

  function renderProgress() {
    var studied = 0, learned = 0;
    state.deck.forEach(function (row) {
      var progress = state.progress[row[0]];
      if (progress) {
        studied++;
        if (progress.box >= 2) learned++;
      }
    });
    var deckTotal = state.deck.length;
    var learning = studied - learned;
    var fresh = deckTotal - studied;
    var studiedPercent = deckTotal ? studied / deckTotal * 100 : 0;
    var learnedPercent = deckTotal ? learned / deckTotal * 100 : 0;
    var remaining = state.queue.length;
    var sessionTotal = state.done + remaining;
    var sessionPercent = sessionTotal ? state.done / sessionTotal * 100 : 100;
    var deckName = state.level + ' ' + ({ vocab: 'words', kanji: 'kanji', grammar: 'grammar' })[state.kind];
    $('fc-overview').hidden = false;
    $('fc-status').classList.add('sr-only');
    $('fc-status').textContent = deckName + ' · ' + remaining + ' to review · ' + studied + ' studied · ' + learned + ' / ' + deckTotal + ' learned';
    $('fc-deck-name').textContent = deckName;
    $('fc-studied').textContent = studied;
    $('fc-deck-total').textContent = deckTotal;
    $('fc-studied-percent').textContent = Number(studiedPercent.toFixed(1)) + '%';
    $('fc-new-count').textContent = fresh;
    $('fc-learning-count').textContent = learning;
    $('fc-learned-count').textContent = learned;
    $('fc-donut').style.setProperty('--learned-end', learnedPercent + '%');
    $('fc-donut').style.setProperty('--studied-end', studiedPercent + '%');
    $('fc-donut').setAttribute('aria-label', fresh + ' not started, ' + learning + ' learning, ' + learned + ' learned; ' + studied + ' of ' + deckTotal + ' studied');
    $('fc-remaining').textContent = remaining;
    $('fc-bar').style.width = sessionPercent + '%';
    $('fc-session-progress').setAttribute('aria-valuenow', String(Math.round(sessionPercent)));
    $('fc-session-progress').setAttribute('aria-valuetext', state.done + ' completed, ' + remaining + ' remaining');
    $('fc-session-caption').textContent = state.done + ' / ' + sessionTotal + ' completed' + (remaining ? ' · New cards + due reviews' : ' · Session complete');
  }

  function next() {
    state.flipped = false;
    $('fc-card').classList.remove('flipped');
    renderProgress();
    state.current = state.queue.shift() || null;
    saveSession();
    var row = state.current;
    $('fc-complete').hidden = !!row;
    ['fc-again', 'fc-flip', 'fc-good'].forEach(function (id) { $(id).disabled = !row; });
    if (!row) {
      var available = state.deck.some(function (card) {
        var progress = state.progress[card[0]];
        return !progress || progress.due <= Date.now();
      });
      $('fc-next').disabled = !available;
      $('fc-front').innerHTML = '🎉';
      $('fc-back').textContent = available
        ? 'Session complete! Continue with the next group, or choose another deck.'
        : 'Session complete! Come back later for due reviews, or choose another deck.';
      $('fc-card').classList.add('flipped');
      return;
    }
    var link = esc(OpenJLPT.root() + row[row.length - 1]);
    if (state.kind === 'vocab') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="reading">' + esc(row[2]) + ' <span class="romaji">' + esc(row[3]) + '</span></div>' +
        '<div class="meaning">' + esc(row[4]) + '</div>' +
        (row[5] ? '<div class="ex">' + ruby(row[5]) + '<br><span style="font-family:system-ui">' + esc(row[6]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    } else if (state.kind === 'kanji') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[4]) + '</div>' +
        '<div class="reading" style="font-size:18px">' + esc(row[2]) + (row[3] ? ' · ' + esc(row[3]) : '') + '</div>' +
        (row[5] ? '<div class="ex">' + esc(row[5]) + '</div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    } else {
      $('fc-front').textContent = row[1];
      $('fc-front').style.fontSize = 'clamp(32px, 8vw, 52px)';
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[3]) + '</div>' +
        (row[4] ? '<div class="ex">' + esc(row[4]) + '<br><span style="font-family:system-ui">' + esc(row[5]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">details ↗</a></p>';
    }
    if (state.kind !== 'grammar') $('fc-front').style.fontSize = '';
  }

  function flip() {
    if (!state.current) return;
    state.flipped = !state.flipped;
    $('fc-card').classList.toggle('flipped', state.flipped);
    saveSession();
  }

  function grade(knew) {
    var row = state.current;
    if (!row) return;
    if (!state.flipped) { flip(); return; }
    var p = state.progress[row[0]] || { box: 0, due: 0 };
    p.box = knew ? Math.min(p.box + 1, BOXES.length - 1) : 0;
    p.due = Date.now() + BOXES[p.box] * DAY;
    state.progress[row[0]] = p;
    saveProgress();
    if (!knew) state.queue.splice(Math.min(3, state.queue.length), 0, row); // see it again soon
    else state.done++;
    next();
  }

  function segment(id, key) {
    var group = $(id);
    group.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      group.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      state[key] = b.getAttribute('data-v');
      start();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    try { state.shuffle = localStorage.getItem('openjlpt:fc:shuffle') === 'true'; } catch (e) { /* default order */ }
    $('fc-shuffle').checked = state.shuffle;
    $('fc-shuffle').addEventListener('change', function () {
      state.shuffle = this.checked;
      try { localStorage.setItem('openjlpt:fc:shuffle', String(state.shuffle)); } catch (e) { /* private mode */ }
      orderRemaining();
    });
    try {
      var selection = JSON.parse(localStorage.getItem('openjlpt:fc:selection') || '{}');
      if (/^N[1-5]$/.test(selection.level)) state.level = selection.level;
      if (['vocab', 'kanji', 'grammar'].includes(selection.kind)) state.kind = selection.kind;
    } catch (e) { /* use default deck */ }
    var hash = location.hash.slice(1).toUpperCase();
    if (/^N[1-5]$/.test(hash)) {
      state.level = hash;
    }
    ['level', 'kind'].forEach(function (key) {
      $('fc-' + key).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === state[key])); });
    });
    segment('fc-level', 'level');
    segment('fc-kind', 'kind');
    $('fc-card').addEventListener('click', flip);
    $('fc-flip').addEventListener('click', flip);
    $('fc-again').addEventListener('click', function () { grade(false); });
    $('fc-good').addEventListener('click', function () { grade(true); });
    $('fc-next').addEventListener('click', function () { start(true); });
    $('fc-choose').addEventListener('click', function () {
      $('fc-level').querySelector('button[aria-pressed="true"]').focus();
      $('fc-level').scrollIntoView({ block: 'center' });
    });
    $('fc-reset').addEventListener('click', function () {
      if (confirm('Reset progress for this deck?')) {
        state.progress = {}; saveProgress();
        try { localStorage.removeItem(storageKey() + ':session'); } catch (e) { /* private mode */ }
        start();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (e.key === ' ') { e.preventDefault(); flip(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); grade(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); grade(true); }
    });
    start();
  });
})();
