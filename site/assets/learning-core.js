// Pure lesson state and question generation, shared by the three foundation modules.
(function (root) {
  'use strict';
  var modules = ['kana', 'verbs', 'word-classes'];
  var key = function (module) { return 'kotowa:learn:' + module + ':v1'; };
  function unique(values) { return Array.from(new Set(values)); }
  function normalize(value, ids) {
    var known = new Set(ids);
    var data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var quiz = data.quiz || {};
    var count = function (n) { return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
    return { version: 1, learned: unique(Array.isArray(data.learned) ? data.learned.filter(function (id) { return known.has(id); }) : []),
      quiz: { rounds: count(quiz.rounds), answered: count(quiz.answered), correct: Math.min(count(quiz.correct), count(quiz.answered)) } };
  }
  function merge(current, imported, ids) {
    var a = normalize(current, ids), b = normalize(imported, ids);
    return { version: 1, learned: unique(a.learned.concat(b.learned)), quiz: b.quiz.answered > a.quiz.answered ? b.quiz : a.quiz };
  }
  function importRecords(value) {
    if (Array.isArray(value)) return { kana: { learned: validateArray(value) } };
    if (!value || value.version !== 1) throw new Error('Invalid progress file.');
    if (value.format === 'kotowa-legacy-kana') return { kana: { learned: validateArray(value.learned) } };
    if (value.format !== 'kotowa-learning' || !value.modules || typeof value.modules !== 'object') throw new Error('Invalid progress file.');
    var result = {};
    modules.forEach(function (module) {
      if (!Object.prototype.hasOwnProperty.call(value.modules, module)) return;
      var progress = value.modules[module];
      result[module] = { learned: validateArray(progress && progress.learned), quiz: progress.quiz };
    });
    if (!Object.keys(result).length) throw new Error('Invalid progress file.');
    return result;
  }
  function validateArray(values) {
    if (!Array.isArray(values) || values.length > 5000 || values.some(function (v) { return typeof v !== 'string' || v.length > 100; })) throw new Error('Invalid progress file.');
    return values;
  }
  function shuffle(values, random) {
    var result = values.slice();
    for (var i = result.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1)), tmp = result[i]; result[i] = result[j]; result[j] = tmp;
    }
    return result;
  }
  function gloss(entry) { return [entry.meanings.zh, entry.meanings.en].filter(Boolean).join(' / '); }
  function translation(example) { return [example.zh, example.en].filter(Boolean).join(' / '); }
  function questions(pool, type, form, random) {
    random = random || Math.random;
    var order = shuffle(pool, random), result = [];
    order.slice(0, 10).forEach(function (entry) {
      var answer, wrong, prompt = entry.word, label = type;
      if (type === 'category') {
        answer = entry.group || entry.category;
        wrong = unique(pool.map(function (row) { return row.group || row.category; }));
      } else if (type === 'forms') {
        if (!entry.forms) return;
        var forms = Object.keys(entry.forms);
        label = form && form !== 'all' ? form : forms[Math.floor(random() * forms.length)];
        answer = entry.forms[label];
        wrong = Object.values(entry.forms);
      } else if (type === 'usage') {
        var example = (entry.examples || []).find(function (e) { return translation(e); });
        if (!example) return;
        prompt = example.ja;
        answer = translation(example);
        wrong = pool.flatMap(function (row) { return (row.examples || []).map(translation); });
      } else {
        answer = gloss(entry);
        wrong = pool.map(gloss);
      }
      if (!answer) return;
      var choices = shuffle(unique(wrong).filter(function (x) { return x && x !== answer; }), random).slice(0, 3);
      if (!choices.length) return;
      choices.push(answer);
      result.push({ id: entry.id, prompt: prompt, answer: answer, label: label, type: type, choices: shuffle(choices, random) });
    });
    return result;
  }
  root.KotowaLearning = { modules: modules, key: key, normalize: normalize, merge: merge, importRecords: importRecords, questions: questions, gloss: gloss };
})(typeof window !== 'undefined' ? window : globalThis);
