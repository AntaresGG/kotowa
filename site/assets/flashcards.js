// Flashcards with a small Leitner-style spaced-repetition schedule, stored in localStorage.
(function () {
  'use strict';
  var I18n = KotowaI18n;
  var t = I18n.t;
  var BOXES = [0, 1, 3, 7, 16, 35]; // days until the next review, per box
  var DAY = 86400000;
  var state = { level: 'N5', kind: 'vocab', mode: 'daily', deck: [], queue: [], index: 0, completed: [], progress: {}, current: null, flipped: false, done: 0, shuffle: false };
  var requestId = 0;
  var focusKey = 'kotowa:fc:focus:v1';
  var focus = {};
  try {
    var stored = JSON.parse(localStorage.getItem(focusKey) || '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) focus = stored;
  } catch (e) { /* empty collection */ }

  function focusIds() {
    var ids = focus[state.kind + ':' + state.level];
    return Array.isArray(ids) ? ids.filter(function (id) { return typeof id === 'string'; }) : [];
  }
  function focusedRows() {
    var ids = new Set(focusIds());
    return state.deck.filter(function (row) { return ids.has(row[0]); });
  }
  function sessionKey() { return storageKey() + (state.mode === 'focus' ? ':focus-session' : ':session'); }
  function renderFocus() {
    var rows = focusedRows();
    $('fc-focus-count').textContent = rows.length;
    var marked = !!state.current && focusIds().includes(state.current[0]);
    $('fc-mark').disabled = !state.current;
    $('fc-mark').setAttribute('aria-pressed', String(marked));
    I18n.text($('fc-mark'), marked ? '★ Saved for focused review' : '☆ Save for focused review');
    $('fc-focus-list').innerHTML = rows.map(function (row) {
      return '<li><a href="' + esc(OpenJLPT.root() + row[row.length - 1]) + '" target="_blank" rel="noopener" lang="ja">' + esc(row[1]) + '</a>' +
        '<button type="button" class="btn" data-remove="' + esc(row[0]) + '" aria-label="' + esc(t('Remove {word} from focused review', { word: row[1] })) + '">' + I18n.html('Remove') + '</button></li>';
    }).join('');
    $('fc-focus-empty').hidden = rows.length > 0;
  }
  function toggleFocus(id) {
    var ids = focusIds();
    var removing = ids.includes(id);
    focus[state.kind + ':' + state.level] = removing ? ids.filter(function (value) { return value !== id; }) : ids.concat(id);
    try {
      localStorage.setItem(focusKey, JSON.stringify(focus));
      if (state.mode === 'daily') localStorage.removeItem(storageKey() + ':focus-session');
      I18n.text($('fc-focus-message'), removing ? 'Removed from focused review.' : 'Saved for focused review.');
    } catch (e) {
      I18n.text($('fc-focus-message'), "Browser storage is unavailable. Changes will last only while this page stays open.");
    }
    if (state.mode === 'focus' && removing) {
      var currentId = state.current && state.current[0];
      var flipped = state.flipped;
      state.queue = state.queue.filter(function (row) { return row[0] !== id; });
      if (state.completed.includes(id)) {
        state.completed = state.completed.filter(function (value) { return value !== id; });
        state.done--;
      }
      var currentIndex = state.queue.findIndex(function (row) { return row[0] === currentId; });
      state.index = currentIndex >= 0 ? currentIndex : Math.min(state.index, Math.max(0, state.queue.length - 1));
      if (!remaining()) state.index = state.queue.length;
      showCurrent();
      if (flipped && state.current && state.current[0] === currentId) flip();
      return;
    }
    renderFocus();
  }

  function storageKey() { return 'openjlpt:fc:' + state.kind + ':' + state.level; }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(storageKey()) || '{}'); } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(storageKey(), JSON.stringify(state.progress)); } catch (e) { /* private mode */ }
  }
  function saveSession() {
    var ids = state.queue.map(function (row) { return row[0]; });
    try {
      localStorage.setItem(sessionKey(), JSON.stringify({ day: new Date().toDateString(), ids: ids, index: state.index, completed: state.completed, done: state.done, flipped: state.flipped, shuffle: state.shuffle }));
    } catch (e) { /* private mode */ }
  }
  function restoreSession(rows) {
    try {
      var saved = JSON.parse(localStorage.getItem(sessionKey()) || 'null');
      if (!saved || saved.day !== new Date().toDateString() || !Array.isArray(saved.ids) || !Number.isInteger(saved.done) || saved.done < 0) return null;
      var byId = new Map(rows.map(function (row) { return [row[0], row]; }));
      var now = Date.now();
      var completed = Array.isArray(saved.completed) ? saved.completed : [];
      state.queue = Array.from(new Set(saved.ids)).filter(function (id) {
        return byId.has(id) && (completed.includes(id) || state.mode === 'focus' || !state.progress[id] || state.progress[id].due <= now);
      }).map(function (id) { return byId.get(id); });
      state.completed = state.queue.filter(function (row) { return completed.includes(row[0]); }).map(function (row) { return row[0]; });
      var currentId = saved.ids[Number.isInteger(saved.index) ? saved.index : 0];
      state.index = state.queue.findIndex(function (row) { return row[0] === currentId; });
      if (state.index < 0) state.index = Math.min(Number.isInteger(saved.index) ? Math.max(0, saved.index) : 0, state.queue.length);
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

  function renderMode() {
    I18n.text($('fc-next'), state.mode === 'focus' ? 'Practice saved cards again' : 'Continue with next group');
    I18n.text($('fc-mode-help'), state.mode === 'focus'
      ? 'Practice all saved cards in this deck anytime. Ratings here do not change your spaced-repetition schedule. Cards stay saved until you remove them.'
      : 'New cards and due reviews. Save any card for extra practice in Focused review.');
  }

  function start(newSession) {
    var request = ++requestId;
    document.dispatchEvent(new CustomEvent('kotowa:study', { detail: { loading: true } }));
    try { localStorage.setItem('openjlpt:fc:selection', JSON.stringify({ level: state.level, kind: state.kind, mode: state.mode })); } catch (e) { /* private mode */ }
    state.current = null;
    state.queue = [];
    state.completed = [];
    state.index = 0;
    state.done = 0;
    state.flipped = false;
    $('fc-overview').hidden = true;
    $('fc-status').classList.remove('sr-only');
    $('fc-complete').hidden = true;
    ['fc-previous', 'fc-flip', 'fc-forward', 'fc-good', 'fc-mark'].forEach(function (id) { $(id).disabled = true; });
    $('fc-focus-library').hidden = true;
    I18n.text($('fc-focus-message'), '');
    $('fc-reset').hidden = state.mode === 'focus';
    renderMode();
    $('fc-card').classList.remove('flipped');
    $('fc-front').textContent = '';
    $('fc-back').removeAttribute('data-i18n');
    $('fc-back').textContent = '';
    I18n.text($('fc-status'), 'Loading…');
    fetch(OpenJLPT.root() + 'data/' + state.kind + '-' + state.level.toLowerCase() + '.json')
      .then(function (r) { if (!r.ok) throw new Error('Could not load deck'); return r.json(); })
      .then(function (rows) {
        if (request !== requestId) return;
        state.deck = rows;
        state.progress = loadProgress();
        $('fc-focus-library').hidden = false;
        if (state.mode === 'focus') rows = focusedRows();
        var saved = newSession === true ? null : restoreSession(rows);
        if (saved) {
          showCurrent();
          if (saved.flipped) flip();
          if (!!saved.shuffle !== state.shuffle) orderRemaining();
          return;
        }
        if (state.mode === 'focus') {
          state.queue = rows.slice();
          if (state.shuffle) shuffle(state.queue);
          state.done = 0;
          state.completed = [];
          state.index = 0;
          showCurrent();
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
        state.completed = [];
        state.index = 0;
        showCurrent();
      }).catch(function () {
        if (request === requestId) {
          I18n.text($('fc-status'), "Unable to load this deck. Select it again to retry.");
          document.dispatchEvent(new CustomEvent('kotowa:study', { detail: { error: true } }));
        }
      });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  }
  function orderRemaining() {
    if (!state.current) return;
    var tail = state.queue.slice(state.index + 1);
    if (state.shuffle) shuffle(tail);
    else {
      var order = new Map(state.deck.map(function (row, i) { return [row[0], i]; }));
      tail.sort(function (a, b) { return order.get(a[0]) - order.get(b[0]); });
    }
    state.queue = state.queue.slice(0, state.index + 1).concat(tail);
    saveSession();
  }

  function remaining() {
    return state.queue.length - state.completed.length;
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
    var left = remaining();
    var sessionTotal = state.done + left;
    var sessionPercent = sessionTotal ? state.done / sessionTotal * 100 : 100;
    var deckName = state.level + ' ' + t(({ vocab: 'words', kanji: 'kanji', grammar: 'grammar' })[state.kind]);
    $('fc-overview').hidden = false;
    $('fc-status').classList.add('sr-only');
    I18n.text($('fc-status'), '{deck} · {remaining} to review · {studied} studied · {learned} / {total} learned', { deck: deckName, remaining: left, studied: studied, learned: learned, total: deckTotal });
    $('fc-deck-name').textContent = deckName;
    $('fc-studied').textContent = studied;
    $('fc-deck-total').textContent = deckTotal;
    $('fc-studied-percent').textContent = Number(studiedPercent.toFixed(1)) + '%';
    $('fc-new-count').textContent = fresh;
    $('fc-learning-count').textContent = learning;
    $('fc-learned-count').textContent = learned;
    $('fc-donut').style.setProperty('--learned-end', learnedPercent + '%');
    $('fc-donut').style.setProperty('--studied-end', studiedPercent + '%');
    $('fc-donut').setAttribute('aria-label', t('{fresh} not started, {learning} learning, {learned} learned; {studied} of {total} studied', { fresh: fresh, learning: learning, learned: learned, studied: studied, total: deckTotal }));
    $('fc-remaining').textContent = left;
    $('fc-bar').style.width = sessionPercent + '%';
    $('fc-session-progress').setAttribute('aria-valuenow', String(Math.round(sessionPercent)));
    $('fc-session-progress').setAttribute('aria-valuetext', t('{done} completed, {remaining} remaining', { done: state.done, remaining: left }));
    I18n.text($('fc-session-caption'), '{done} / {total} completed · {mode}', { done: state.done, total: sessionTotal, mode: t(left ? (state.mode === 'focus' ? 'Focused review' : 'New cards + due reviews') : 'Session complete') });
    document.dispatchEvent(new CustomEvent('kotowa:study', { detail: {
      studied: studied, total: deckTotal, done: state.done, sessionTotal: sessionTotal,
      studiedPercent: studiedPercent, sessionPercent: sessionPercent,
      deck: deckName, mode: state.mode
    } }));
  }

  function showCurrent() {
    state.flipped = false;
    $('fc-card').classList.remove('flipped');
    state.current = state.queue[state.index] || null;
    renderProgress();
    renderFocus();
    saveSession();
    var row = state.current;
    $('fc-complete').hidden = !!row;
    $('fc-previous').disabled = !state.queue.length || state.index === 0;
    $('fc-forward').disabled = !row || (state.index === state.queue.length - 1 && remaining() > 0);
    $('fc-flip').disabled = !row;
    var completed = !!row && state.completed.includes(row[0]);
    $('fc-good').disabled = !row || completed;
    $('fc-good').setAttribute('aria-pressed', String(completed));
    if (!row) {
      var available = state.mode === 'focus' ? focusedRows().length > 0 : state.deck.some(function (card) {
        var progress = state.progress[card[0]];
        return !progress || progress.due <= Date.now();
      });
      $('fc-next').disabled = !available;
      $('fc-front').innerHTML = '🎉';
      I18n.text($('fc-back'), available
        ? 'Session complete! Continue with the next group, or choose another deck.'
        : 'Session complete! Come back later for due reviews, or choose another deck.');
      if (state.mode === 'focus') {
        $('fc-front').textContent = available ? '🎉' : '☆';
        I18n.text($('fc-back'), available ? 'Session complete! Your cards stay saved. Practice them again anytime.' : 'No saved cards in this deck. Save cards during daily review, or choose another deck.');
      }
      $('fc-card').classList.add('flipped');
      return;
    }
    $('fc-back').removeAttribute('data-i18n');
    var link = esc(OpenJLPT.root() + row[row.length - 1]);
    if (state.kind === 'vocab') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="reading">' + esc(row[2]) + ' <span class="romaji">' + esc(row[3]) + '</span></div>' +
        '<div class="meaning">' + esc(row[4]) + '</div>' +
        (row[5] ? '<div class="ex">' + ruby(row[5]) + '<br><span style="font-family:system-ui">' + esc(row[6]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">' + I18n.html('details ↗') + '</a></p>';
    } else if (state.kind === 'kanji') {
      $('fc-front').textContent = row[1];
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[4]) + '</div>' +
        '<div class="reading" style="font-size:18px">' + esc(row[2]) + (row[3] ? ' · ' + esc(row[3]) : '') + '</div>' +
        (row[5] ? '<div class="ex">' + esc(row[5]) + '</div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">' + I18n.html('details ↗') + '</a></p>';
    } else {
      $('fc-front').textContent = row[1];
      $('fc-front').style.fontSize = 'clamp(32px, 8vw, 52px)';
      $('fc-back').innerHTML = '<div class="meaning">' + esc(row[3]) + '</div>' +
        (row[4] ? '<div class="ex">' + esc(row[4]) + '<br><span style="font-family:system-ui">' + esc(row[5]) + '</span></div>' : '') +
        '<p><a href="' + link + '" target="_blank" rel="noopener">' + I18n.html('details ↗') + '</a></p>';
    }
    if (state.kind !== 'grammar') $('fc-front').style.fontSize = '';
  }

  function flip() {
    if (!state.current) return;
    state.flipped = !state.flipped;
    $('fc-card').classList.toggle('flipped', state.flipped);
    saveSession();
  }

  function navigate(offset) {
    var index = state.index + offset;
    var maximum = state.queue.length - (remaining() ? 1 : 0);
    if (index < 0 || index > maximum || !state.queue.length) return;
    state.index = index;
    showCurrent();
  }

  function grade() {
    var row = state.current;
    if (!row || state.completed.includes(row[0])) return;
    if (state.mode === 'daily') {
      var p = state.progress[row[0]] || { box: 0, due: 0 };
      p.box = Math.min(p.box + 1, BOXES.length - 1);
      p.due = Date.now() + BOXES[p.box] * DAY;
      state.progress[row[0]] = p;
      saveProgress();
    }
    state.completed.push(row[0]);
    state.done++;
    var index = state.index;
    do { index = (index + 1) % state.queue.length; }
    while (index !== state.index && state.completed.includes(state.queue[index][0]));
    state.index = remaining() ? index : state.queue.length;
    showCurrent();
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

  document.addEventListener('kotowa:language', function () {
    renderMode();
    renderFocus();
    if (!$('fc-overview').hidden) renderProgress();
  });

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
      if (selection.mode === 'focus') state.mode = 'focus';
    } catch (e) { /* use default deck */ }
    var hash = location.hash.slice(1).toUpperCase();
    if (/^N[1-5]$/.test(hash)) {
      state.level = hash;
    }
    ['level', 'kind', 'mode'].forEach(function (key) {
      $('fc-' + key).querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === state[key])); });
    });
    segment('fc-level', 'level');
    segment('fc-kind', 'kind');
    segment('fc-mode', 'mode');
    $('fc-mark').addEventListener('click', function () { if (state.current) toggleFocus(state.current[0]); });
    $('fc-focus-list').addEventListener('click', function (e) {
      var button = e.target.closest('button[data-remove]');
      if (button) toggleFocus(button.getAttribute('data-remove'));
    });
    $('fc-card').addEventListener('click', flip);
    $('fc-flip').addEventListener('click', flip);
    $('fc-previous').addEventListener('click', function () { navigate(-1); });
    $('fc-forward').addEventListener('click', function () { navigate(1); });
    $('fc-good').addEventListener('click', grade);
    $('fc-next').addEventListener('click', function () { start(true); });
    $('fc-choose').addEventListener('click', function () {
      $('fc-level').querySelector('button[aria-pressed="true"]').focus();
      $('fc-level').scrollIntoView({ block: 'center' });
    });
    $('fc-reset').addEventListener('click', function () {
      if (confirm(t('Reset progress for this deck?'))) {
        state.progress = {}; saveProgress();
        try { localStorage.removeItem(storageKey() + ':session'); } catch (e) { /* private mode */ }
        start();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); if (!e.repeat) flip(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (!e.repeat) grade(); }
    });
    start();
  });
})();
