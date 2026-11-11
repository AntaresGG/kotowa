// Foundation lessons, independent practice records and the legacy kana transfer.
(function () {
  'use strict';
  var host = document.querySelector('[data-learning-module]');
  if (!host) return;
  var Core = KotowaLearning, I = KotowaI18n, t = I.t, module = host.dataset.learningModule;
  var datasets = {}, records = {}, pending = {}, current = null, mode = 'learn', questions = [], index = 0, answers = [];
  var roundRecorded = false, filterSignature = '', ready = false;
  var categoryLabels = { pro:'Pronouns', num:'Numbers and counters', rent:'Prenominal adjectives', adv:'Adverbs', conj:'Conjunctions', intj:'Interjections', aux:'Auxiliary expressions', part:'Particles', exp:'Expressions', g1:'Godan verbs', g2:'Ichidan verbs', g3:'Irregular verbs' };
  var formLabels = { neg:'Negative', masu:'Polite', te:'Te form', ta:'Past', poss:'Potential', voli:'Volitional', imp:'Imperative', cond:'Conditional' };
  var kanaLabels = { basic:'Basic kana', voiced:'Voiced sounds', semivoiced:'Semi-voiced sounds', combinations:'Combinations' };
  function $(id) { return document.getElementById(id); }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function ruby(value) { return esc(value).replace(/\{([^|{}]+)\|([^|{}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>'); }
  function message(text, params) { I.text($('learn-message'), text, params); }
  function ids(name) { return datasets[name].map(function (e) { return e.id; }); }
  function read(name) {
    try { return Core.normalize(JSON.parse(localStorage.getItem(Core.key(name)) || '{}'), ids(name)); }
    catch (e) { message('Browser storage is unavailable or contains invalid records. Export your progress before leaving.'); return Core.normalize(null, ids(name)); }
  }
  function save(name) {
    try { localStorage.setItem(Core.key(name), JSON.stringify(records[name])); return true; }
    catch (e) { message('Browser storage is unavailable. Changes will last only while this page stays open.'); return false; }
  }
  function load(name) {
    if (!pending[name]) pending[name] = fetch(OpenJLPT.root() + 'data/learn-' + name + '.json').then(function (r) {
      if (!r.ok) throw new Error('Lesson could not load.');
      return r.json();
    }).then(function (data) {
      if (!Array.isArray(data) || !data.length) throw new Error('Lesson could not load.');
      datasets[name] = data; records[name] = read(name); return data;
    }).catch(function (e) { delete pending[name]; throw e; });
    return pending[name];
  }
  function speak(word) {
    return 'speechSynthesis' in window ? '<button type="button" class="speak" data-speak="' + esc(word) + '" aria-label="' + esc(t('Listen')) + '">🔊</button>' : '';
  }
  function summary() {
    if (module === 'hub') {
      Core.modules.forEach(function (name) {
        I.text(document.querySelector('[data-module-progress="' + name + '"]'), '{done} / {total} studied', { done:records[name].learned.length, total:datasets[name].length });
      });
      return;
    }
    var p = records[module], total = datasets[module].length;
    I.text($('learn-progress-text'), '{done} / {total} studied', { done:p.learned.length, total:total });
    $('learn-progress').value = p.learned.length / total * 100;
    I.text($('learn-quiz-history'), 'Quiz history: {correct} / {answered} correct · {rounds} rounds', p.quiz);
    document.dispatchEvent(new CustomEvent('kotowa:lesson', { detail: {
      title: module === 'kana' ? 'Kana' : module === 'verbs' ? 'Verb practice' : 'Word classes',
      studied: p.learned.length, total:total, correct:p.quiz.correct, answered:p.quiz.answered,
    } }));
  }
  function filtered() {
    var query = OpenJLPT.toHiragana($('learn-search').value.trim().toLowerCase());
    var category = $('learn-category').value, level = $('learn-level') && $('learn-level').value;
    return datasets[module].filter(function (e) {
      return (category === 'all' || e.category === category || e.group === category) &&
        (!level || level === 'all' || (level === 'supplemental' ? !e.level : e.level === level)) &&
        (!query || OpenJLPT.toHiragana([e.word,e.reading,e.romaji,e.kata,Core.gloss(e)].join(' ').toLowerCase()).includes(query));
    });
  }
  function badges(entry) { return entry.level ? '<span class="lvl ' + esc(entry.level) + '">' + esc(entry.level) + '</span>' : I.html('Supplemental'); }
  function focusMarked(entry) {
    try { var data = JSON.parse(localStorage.getItem('kotowa:fc:focus:v1') || '{}'); return Array.isArray(data[ 'vocab:' + entry.vocab.level ]) && data['vocab:' + entry.vocab.level].includes(entry.vocab.id); }
    catch (e) { return false; }
  }
  function renderDetail() {
    var entry = current;
    if (!entry) { $('learn-detail').innerHTML = I.html('No results.'); return; }
    var kana = module === 'kana', studied = records[module].learned.includes(entry.id);
    $('learn-detail').innerHTML = '<h2 lang="ja">' + esc(kana ? entry.hira + ' / ' + entry.kata : entry.word) + '</h2>' +
      '<p class="muted"><span lang="ja">' + esc(entry.reading) + '</span> · ' + esc(entry.romaji) + ' ' + speak(entry.reading) + '</p>' +
      (kana ? '' : '<p>' + badges(entry) + ' · ' + I.html(categoryLabels[entry.group || entry.category] || 'Expressions') + '</p><p class="learn-gloss">' + esc(Core.gloss(entry)) + '</p>') +
      (entry.explanation ? '<p lang="zh-CN"' + (kana && !$('kana-hints').checked ? ' hidden' : '') + '>' + esc(entry.explanation) + '</p>' : '') +
      (entry.formation ? '<p lang="zh-CN">' + esc(entry.formation) + '</p>' : '') +
      (entry.notes ? '<p class="muted" lang="zh-CN">' + esc(entry.notes) + '</p>' : '') +
      '<div class="btn-row"><button class="btn" type="button" id="learn-mark" aria-pressed="' + studied + '">' + I.html(studied ? '✓ Studied' : 'Mark as studied') + '</button>' +
      (entry.vocab ? '<button class="btn" type="button" id="learn-focus" aria-pressed="' + focusMarked(entry) + '">' + I.html(focusMarked(entry) ? '★ Saved for focused review' : '☆ Save for focused review') + '</button>' : '') + '</div>' +
      (entry.forms ? '<dl class="learn-forms">' + Object.keys(formLabels).map(function (form) {
        return '<div><dt>' + I.html(formLabels[form]) + '</dt><dd lang="ja">' + esc(entry.forms[form]) + ' ' + speak(entry.forms[form]) + '</dd></div>';
      }).join('') + '</dl>' : '') +
      (entry.usage.length ? '<h3>' + I.html('Usage') + '</h3><ul>' + entry.usage.map(function (u) {
        return '<li lang="zh-CN">' + esc(u.label) + ' · ' + esc(u.ja) + (u.meaning ? ' — ' + esc(u.meaning) : '') + '</li>';
      }).join('') + '</ul>' : '') +
      (entry.examples.length ? '<h3>' + I.html('Examples') + '</h3>' + entry.examples.map(function (e) {
        return '<div class="learn-example"><p lang="ja">' + ruby(e.furigana || e.ja) + ' ' + speak(e.ja) + '</p>' +
          (e.zh ? '<p lang="zh-CN">' + esc(e.zh) + '</p>' : '') + (e.en ? '<p lang="en" class="muted">' + esc(e.en) + '</p>' : '') + '</div>';
      }).join('') : '') +
      '<div class="btn-row">' + (entry.vocab ? '<a class="btn" href="' + esc(OpenJLPT.root() + entry.vocab.path) + '">' + I.html('Dictionary entry') + '</a><a class="btn" href="' + esc(OpenJLPT.root() + 'flashcards.html') + '" id="learn-practice">' + I.html('Practice saved cards') + '</a>' : '') +
      entry.grammar.map(function (g) { return '<a class="btn" href="' + esc(OpenJLPT.root() + g.path) + '"><span lang="ja">' + esc(g.word) + '</span> ↗</a>'; }).join('') + '</div>';
    $('learn-mark').addEventListener('click', function () {
      var learned = records[module].learned;
      records[module].learned = learned.includes(entry.id) ? learned.filter(function (id) { return id !== entry.id; }) : learned.concat(entry.id);
      save(module); render();
    });
    if (entry.vocab) {
      $('learn-focus').addEventListener('click', function () {
        try {
          var focus = JSON.parse(localStorage.getItem('kotowa:fc:focus:v1') || '{}');
          if (!focus || typeof focus !== 'object' || Array.isArray(focus)) focus = {};
          var deck = 'vocab:' + entry.vocab.level, list = Array.isArray(focus[deck]) ? focus[deck] : [];
          var removing = list.includes(entry.vocab.id);
          focus[deck] = removing ? list.filter(function (id) { return id !== entry.vocab.id; }) : list.concat(entry.vocab.id);
          localStorage.setItem('kotowa:fc:focus:v1', JSON.stringify(focus));
          // Retain daily sessions; focused sessions restore only IDs still in the collection.
          localStorage.removeItem('openjlpt:fc:vocab:' + entry.vocab.level + ':focus-session');
          message(removing ? 'Removed from focused review.' : 'Saved for focused review.'); renderDetail();
        } catch (e) { message('Browser storage is unavailable. The card could not be saved.'); }
      });
      $('learn-practice').addEventListener('click', function () {
        try { localStorage.setItem('openjlpt:fc:selection', JSON.stringify({ kind:'vocab', level:entry.vocab.level, mode:'focus' })); } catch (e) { /* use existing deck */ }
      });
    }
  }
  function renderKana(pool) {
    var script = $('kana-script').value;
    var html = Object.keys(kanaLabels).map(function (category) {
      var items = pool.filter(function (e) { return e.category === category; });
      if (!items.length) return '';
      var rows = Array.from(new Set(items.map(function (e) { return e.row; })));
      return '<section><h2>' + I.html(kanaLabels[category]) + '</h2>' + rows.map(function (row) {
        var cells = items.filter(function (e) { return e.row === row; });
        return '<div class="kana-row ' + (category === 'combinations' ? 'combinations' : '') + '"><strong lang="ja">' + esc(row.replace('行','')) + '</strong>' + cells.map(function (entry) {
          var studied = records.kana.learned.includes(entry.id);
          var label = script === 'kata' ? entry.kata : entry.hira;
          var vowels = category === 'combinations' ? ['a','u','o'] : ['a','i','u','e','o'];
          var column = Math.max(0, vowels.indexOf(entry.romaji.slice(-1))) + 2;
          return '<button type="button" class="btn kana-tile" style="grid-column:' + column + '" data-id="' + esc(entry.id) + '" data-studied="' + studied + '"><span class="kana-char" lang="ja">' + esc(label) + '</span>' +
            (script === 'both' ? '<span lang="ja">' + esc(entry.kata) + '</span>' : '') + '<small>' + esc(entry.romaji) + '</small>' +
            (studied ? '<span class="kana-tick" aria-label="' + esc(t('Studied')) + '">✓</span>' : '') + '</button>';
        }).join('') + '</div>';
      }).join('') + '</section>';
    }).join('');
    $('learn-content').innerHTML = html || '<p>' + I.html('No results.') + '</p>';
    $('learn-content').querySelectorAll('[data-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        current = datasets.kana.find(function (e) { return e.id === button.dataset.id; }); renderDetail();
        $('kana-dialog').showModal();
      });
    });
  }
  function render() {
    summary();
    if (module === 'hub') return;
    var pool = filtered();
    if (module === 'kana') {
      renderKana(pool);
      if (current) renderDetail();
    } else {
      if (!current || !pool.some(function (e) { return e.id === current.id; })) current = pool[0] || null;
      I.text($('learn-list-count'), '{count} items', { count:pool.length });
      $('learn-list').innerHTML = pool.map(function (entry) {
        return '<button type="button" class="btn learn-item" data-id="' + esc(entry.id) + '" aria-pressed="' + (entry === current) + '"><span lang="ja">' + esc(entry.word) + '</span><small>' +
          (records[module].learned.includes(entry.id) ? '✓ ' : '') + esc(entry.level || '') + '</small></button>';
      }).join('');
      $('learn-list').querySelectorAll('[data-id]').forEach(function (button) {
        button.addEventListener('click', function () {
          current = pool.find(function (e) { return e.id === button.dataset.id; });
          history.replaceState(null, '', '#item=' + encodeURIComponent(current.id)); render();
        });
      });
      $('learn-content').hidden = mode !== 'learn'; $('learn-quiz').hidden = mode !== 'quiz'; renderDetail();
      renderQuestion();
    }
  }
  function renderQuestion() {
    if (!questions.length) return;
    var q = questions[index];
    $('learn-quiz-start').hidden = true;
    if (!q) {
      I.text($('learn-question'), 'Round complete: {correct} / {total} correct.', { correct:answers.filter(Boolean).length, total:questions.length });
      $('learn-quiz-next').hidden = true; $('learn-quiz-start').hidden = false;
      I.text($('learn-quiz-start'), 'Practice again'); return;
    }
    var answered = answers.length > index;
    $('learn-question').innerHTML = '<p>' + I.html('Question {number} / {total}', { number:index + 1, total:questions.length }) + '</p>' +
      '<p>' + I.html(q.type === 'forms' ? 'Choose the {form} form.' : q.type === 'category' ? 'Choose the word class or verb group.' : q.type === 'usage' ? 'Choose the meaning of this example.' : 'Choose the meaning.', { form:t(formLabels[q.label] || 'Meaning') }) + '</p>' +
      '<p class="learn-question-word" lang="ja">' + esc(q.prompt) + '</p><div class="learn-quiz-options">' + q.choices.map(function (choice, i) {
        var display = q.type === 'category' ? t(categoryLabels[choice] || choice) : choice;
        return '<button type="button" class="btn" data-choice="' + i + '"' + (answered ? ' disabled' : '') + (answered && choice === q.answer ? ' data-result="correct"' : '') + '>' + esc(display) + '</button>';
      }).join('') + '</div>';
    if (!answered) I.text($('learn-feedback'), '');
    $('learn-quiz-next').hidden = !answered;
    $('learn-question').querySelectorAll('[data-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (answers.length > index) return;
        var correct = q.choices[Number(button.dataset.choice)] === q.answer;
        answers.push(correct); renderQuestion();
        var display = q.type === 'category' ? t(categoryLabels[q.answer]) : q.answer;
        I.text($('learn-feedback'), correct ? 'Correct.' : 'Correct answer: {answer}', { answer:display });
        if (!correct) $('learn-question').querySelector('[data-choice="' + button.dataset.choice + '"]').dataset.result = 'wrong';
      });
    });
  }
  function resetQuiz() {
    questions = []; answers = []; index = 0; roundRecorded = false;
    $('learn-question').textContent = ''; $('learn-feedback').textContent = '';
    $('learn-quiz-next').hidden = true; $('learn-quiz-start').hidden = false;
    I.text($('learn-quiz-start'), 'Start quiz');
  }
  function setupQuiz() {
    $('learn-mode').querySelectorAll('[data-mode]').forEach(function (button) {
      button.addEventListener('click', function () {
        mode = button.dataset.mode;
        $('learn-mode').querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); }); render();
      });
    });
    $('learn-quiz-start').addEventListener('click', function () {
      resetQuiz();
      questions = Core.questions(filtered(), $('learn-quiz-type').value, $('learn-quiz-form') && $('learn-quiz-form').value);
      if (!questions.length) { I.text($('learn-question'), 'Choose a wider set of filters to build a quiz.'); return; }
      renderQuestion();
    });
    $('learn-quiz-next').addEventListener('click', function () {
      if (answers.length <= index) return;
      index++; $('learn-feedback').textContent = '';
      if (index === questions.length && !roundRecorded) {
        var quiz = records[module].quiz; quiz.rounds++; quiz.answered += questions.length; quiz.correct += answers.filter(Boolean).length;
        roundRecorded = true; save(module); summary();
      }
      renderQuestion();
    });
    ['learn-quiz-type','learn-quiz-form'].forEach(function (id) { if ($(id)) $(id).addEventListener('change', resetQuiz); });
  }
  function download(data, filename) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }), url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $('learn-export').addEventListener('click', function () {
    Promise.all(Core.modules.map(load)).then(function () { download({ format:'kotowa-learning', version:1, modules:records }, 'kotowa-learning-progress.json'); })
      .catch(function () { message('Lesson could not load. Reload to try again.'); });
  });
  $('learn-import').addEventListener('change', function (event) {
    var file = event.target.files[0]; if (!file) return;
    if (file.size > 1024 * 1024) { message('Invalid progress file.'); event.target.value = ''; return; }
    file.text().then(function (text) {
      var imported = Core.importRecords(JSON.parse(text));
      return Promise.all(Object.keys(imported).map(load)).then(function () {
        var persisted = true;
        Object.keys(imported).forEach(function (name) { records[name] = Core.merge(records[name], imported[name], ids(name)); if (!save(name)) persisted = false; });
        if (persisted) message('Progress imported. Existing records were kept.'); render();
      });
    }).catch(function () { message('Invalid progress file.'); }).finally(function () { event.target.value = ''; });
  });
  function setupMigration() {
    var origins;
    try { origins = JSON.parse(host.dataset.legacyOrigins); } catch (e) { origins = []; }
    $('learn-migration').hidden = !origins.length;
    var markerKey = 'kotowa:learn:migrations:v1';
    $('learn-legacy-links').innerHTML = origins.map(function (origin) {
      return '<a class="btn" target="_blank" rel="noopener" href="' + esc(origin + '/_kotowa-migration/') + '">' + I.html('Export from old site') + '</a>';
    }).join(' ');
    var active = false;
    function migrate(force) {
      if (active) return;
      var markers;
      try { markers = JSON.parse(localStorage.getItem(markerKey) || '{}'); if (!markers || typeof markers !== 'object' || Array.isArray(markers)) markers = {}; }
      catch (e) { markers = {}; }
      var remaining = origins.filter(function (origin) { return force || !markers[origin]; });
      if (!remaining.length) return;
      active = true;
      I.text($('learn-migration-status'), 'Transferring old kana progress…');
      var complete = 0, failed = false;
      remaining.forEach(function (origin) {
        var frame = document.createElement('iframe'), finished = false;
        frame.hidden = true; frame.title = t('Bring progress from the old site');
        frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        var timer;
        function finish(ok) {
          if (finished) return; finished = true; failed = failed || !ok; complete++;
          clearTimeout(timer); window.removeEventListener('message', receive); frame.remove();
          if (complete === remaining.length) {
            active = false;
            I.text($('learn-migration-status'), failed ? 'Automatic transfer is unavailable. Export from the old site, then import the file here.' : 'Old kana progress merged. Original records were kept.');
          }
        }
        function receive(event) {
          if (event.origin !== origin || event.source !== frame.contentWindow || event.data?.type !== 'kotowa:legacy-kana') return;
          if (event.data.status !== 'ok') { finish(false); return; }
          try {
            var imported = Core.importRecords({ format:'kotowa-legacy-kana', version:1, learned:event.data.learned });
            records.kana = Core.merge(records.kana, imported.kana, ids('kana'));
            var saved = save('kana'); render();
            if (saved) { markers[origin] = true; localStorage.setItem(markerKey, JSON.stringify(markers)); }
            finish(saved);
          } catch (e) { finish(false); }
        }
        window.addEventListener('message', receive);
        frame.addEventListener('load', function () { if (!finished) frame.contentWindow.postMessage({ type:'kotowa:legacy-request' }, origin); });
        timer = setTimeout(function () { finish(false); }, 8000);
        frame.src = origin + '/_kotowa-migration/'; host.appendChild(frame);
      });
    }
    $('learn-migrate').addEventListener('click', function () { migrate(true); }); migrate(false);
  }
  function start() {
    return Promise.all((module === 'hub' ? Core.modules : [module]).map(load)).then(function () {
      ready = true;
      if (!$('learn-message').hasAttribute('data-i18n')) message('');
      if (module !== 'hub') {
        try { var selected = new URLSearchParams(location.hash.slice(1)).get('item'); current = datasets[module].find(function (e) { return e.id === selected; }) || null; } catch (e) { /* first item */ }
        ['learn-search','learn-category','learn-level','kana-script','kana-hints'].forEach(function (id) {
          if (!$(id)) return;
          $(id).addEventListener(id === 'learn-search' ? 'input' : 'change', function () {
            var signature = JSON.stringify([$('learn-search').value,$('learn-category').value,$('learn-level') && $('learn-level').value]);
            if (module !== 'kana' && signature !== filterSignature) resetQuiz(); filterSignature = signature; render();
          });
        });
        $('learn-reset').addEventListener('click', function () {
          if (!window.confirm(t('Reset studied items and quiz history for this lesson?'))) return;
          records[module] = Core.normalize(null, ids(module)); save(module); if (module !== 'kana') resetQuiz(); render();
        });
        if (module === 'kana') {
          $('kana-close').addEventListener('click', function () { $('kana-dialog').close(); }); setupMigration();
        } else setupQuiz();
      }
      render();
    }).catch(function () { message('Lesson could not load. Reload to try again.'); });
  }
  document.addEventListener('kotowa:language', function () { if (ready) render(); });
  window.addEventListener('storage', function (event) {
    if (!ready) return;
    Core.modules.forEach(function (name) { if (datasets[name] && (event.key === Core.key(name) || event.key === null)) records[name] = read(name); });
    render();
  });
  start();
})();
