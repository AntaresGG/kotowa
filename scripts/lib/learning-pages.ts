import { ui, uiAttr } from './site-i18n.ts';
import { CATEGORY_LABELS, FORM_LABELS, LEARNING_MODULES, type LearningModule } from './learning.ts';

export const MODULE_TITLES: Record<LearningModule, string> = {
  kana: 'Kana', verbs: 'Verb practice', 'word-classes': 'Word classes',
};
const descriptions: Record<LearningModule, string> = {
  kana: 'Learn hiragana and katakana, then practice voiced sounds and combinations.',
  verbs: 'Explore eight verb forms and practice meanings, conjugations and verb groups.',
  'word-classes': 'Explore word classes, usage and examples, then check your understanding.',
};
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const options = (items: Record<string, string>) => Object.entries(items).map(([value, label]) =>
  `<option value="${value}" data-i18n="${label}">${label}</option>`).join('');
const transfer = () => `<details class="learn-transfer"><summary>${ui('Back up or transfer progress')}</summary>
<p class="muted">${ui('Practice records stay in this browser. Import merges learned items and keeps your current records.')}</p>
<div class="btn-row"><button type="button" class="btn" id="learn-export">${ui('Export progress')}</button>
<label class="btn">${ui('Import progress')}<input type="file" id="learn-import" accept="application/json,.json" class="sr-only"></label></div></details>`;
const progress = () => `<section class="learn-progress card" ${uiAttr('aria-label', 'Learning progress')}>
<div><strong id="learn-progress-text"></strong><span class="muted" id="learn-quiz-history"></span></div>
<progress id="learn-progress" max="100" value="0" ${uiAttr('aria-label', 'Items studied')}></progress>
<p class="muted small">${ui('Mark items as studied while learning. Quiz scores are separate from flashcard mastery and review dates.')}</p></section>`;

export function learningPages(legacyOrigins: string[]) {
  const common = { active: 'learn/index.html', scripts: ['assets/learning-core.js', 'assets/learning.js'], styles: ['assets/learning.css'] };
  const nav = (root: string, current = '') => `<nav class="btn-row quick learn-nav" ${uiAttr('aria-label', 'Foundation navigation')}>
${LEARNING_MODULES.map(m => `<a class="btn" href="${root}${m}/"${m === current ? ' aria-current="page"' : ''}>${ui(MODULE_TITLES[m])}</a>`).join('')}</nav>`;
  const pages = [{ ...common, path: 'learn/index.html', title: 'Foundations — kana, verbs and word classes | Kotowa · 词和',
    description: 'Learn Japanese kana, verb conjugation and word classes with Kotowa.',
    body: `<section class="learn" data-learning-module="hub"><h1>${ui('Foundations')}</h1>
<p class="lead">${ui('Start with kana, build word and grammar skills, then review with flashcards.')}</p>
<div class="grid grid-3 learn-hub">${LEARNING_MODULES.map((m, i) => `<a class="card level-card" href="${m}/">
<span class="muted">0${i + 1}</span><h2>${ui(MODULE_TITLES[m])}</h2><p>${ui(descriptions[m])}</p>
<p class="muted" data-module-progress="${m}"></p><span>${ui('Start learning')} →</span></a>`).join('')}</div>
<div class="btn-row"><a class="btn" href="../flashcards.html">${ui('Flashcards')}</a><a class="btn" href="../">${ui('Dictionary')}</a></div>
<p id="learn-message" role="status"></p>${transfer()}</section>` }];
  for (const module of LEARNING_MODULES) {
    const kana = module === 'kana';
    const categories = kana ? { basic: 'Basic kana', voiced: 'Voiced sounds', semivoiced: 'Semi-voiced sounds', combinations: 'Combinations' }
      : module === 'verbs' ? { g1: 'Godan verbs', g2: 'Ichidan verbs', g3: 'Irregular verbs' } : CATEGORY_LABELS;
    pages.push({ ...common, path: `learn/${module}/index.html`, title: `${MODULE_TITLES[module]} | Kotowa · 词和`,
      description: descriptions[module], body: `<section class="learn" data-learning-module="${module}" data-legacy-origins="${esc(JSON.stringify(legacyOrigins))}">
<nav class="crumbs" ${uiAttr('aria-label', 'Breadcrumb')}><a href="../../">${ui('Home')}</a> › <a href="../">${ui('Foundations')}</a> › ${ui(MODULE_TITLES[module])}</nav>
<h1>${ui(MODULE_TITLES[module])}</h1><p class="muted">${ui(descriptions[module])}</p>${nav('../', module)}
${progress()}<p id="learn-message" role="status">${ui('Loading…')}</p>
${kana ? '' : `<div class="seg" id="learn-mode" role="group" ${uiAttr('aria-label', 'Study mode')}><button type="button" data-mode="learn" aria-pressed="true">${ui('Learn')}</button><button type="button" data-mode="quiz" aria-pressed="false">${ui('Quiz')}</button></div>`}
<div class="learn-toolbar"><label>${ui('Search')}<input type="search" id="learn-search" ${uiAttr('placeholder', 'Search this lesson…')}></label>
<label>${ui('Category')}<select id="learn-category"><option value="all" data-i18n="All categories">All categories</option>${options(categories)}</select></label>
${kana ? `<label>${ui('Writing system')}<select id="kana-script">${options({hira:'Hiragana',kata:'Katakana',both:'Both'})}</select></label><label class="learn-check"><input type="checkbox" id="kana-hints" checked>${ui('Pronunciation tips')}</label>` :
`<label>${ui('Level')}<select id="learn-level"><option value="all" data-i18n="All levels">All levels</option>${['N5','N4','N3','N2','N1'].map(l=>`<option>${l}</option>`).join('')}<option value="supplemental" data-i18n="Supplemental">Supplemental</option></select></label>`}</div>
<div id="learn-content"${kana ? ' class="kana-chart"' : ' class="learn-workspace"'}>
${kana ? '' : `<div><p id="learn-list-count" class="muted small"></p><div class="learn-list" id="learn-list" ${uiAttr('aria-label', 'Lesson items')}></div></div><article class="card learn-detail" id="learn-detail" aria-live="polite"></article>`}</div>
${kana ? `<dialog id="kana-dialog" class="card"><button type="button" class="btn" id="kana-close">${ui('Close')}</button><article id="learn-detail"></article></dialog>
<div class="btn-row"><button type="button" id="learn-reset" class="btn">${ui('Reset this lesson')}</button></div>
<details id="learn-migration"><summary>${ui('Bring progress from the old site')}</summary><p id="learn-migration-status" role="status"></p>
<div class="btn-row"><button type="button" class="btn" id="learn-migrate">${ui('Retry transfer')}</button><span id="learn-legacy-links"></span></div></details>` :
`<section id="learn-quiz" class="card" hidden>
<div class="learn-toolbar"><label>${ui('Quiz type')}<select id="learn-quiz-type">${options(module === 'verbs' ? {forms:'Conjugation',meanings:'Meaning',category:'Verb group'} : {meanings:'Meaning',category:'Word class',usage:'Usage'})}</select></label>
${module === 'verbs' ? `<label>${ui('Verb form')}<select id="learn-quiz-form"><option value="all" data-i18n="All forms">All forms</option>${options(FORM_LABELS)}</select></label>` : ''}</div>
<p>${ui('Each round uses up to ten items from the current filters.')}</p><button type="button" class="btn primary" id="learn-quiz-start">${ui('Start quiz')}</button>
<div id="learn-question" aria-live="polite"></div><p id="learn-feedback" role="status"></p><button type="button" class="btn" id="learn-quiz-next" hidden>${ui('Next')}</button>
</section><div class="btn-row"><button type="button" id="learn-reset" class="btn">${ui('Reset this lesson')}</button></div>`}
${transfer()}<noscript><p>${ui('Enable JavaScript to use these lessons and transfer browser progress.')}</p></noscript></section>` });
  }
  return pages;
}

/** Install this generated, self-contained bridge on the legacy origin before redirects. */
export function legacyMigrationPage(siteUrl: string) {
  const target = new URL('learn/kana/', siteUrl);
  const config = JSON.stringify({ origin: target.origin, href: target.href }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>迁移五十音进度 · Kotowa</title>
<link rel="stylesheet" href="${esc(new URL('assets/style.css', siteUrl).href)}"></head><body><main class="wrap"><h1>迁移五十音进度</h1><p>导出旧站记录后，在 Kotowa 的“导入进度”中选择文件。原记录会保留。</p><p id="status" role="status"></p><div class="btn-row"><button class="btn" id="export" type="button">导出五十音记录</button><a class="btn primary" href="${esc(target.href)}">前往 Kotowa</a></div></main><script>
(function () { 'use strict';
  var target = ${config};
  function read() {
    try { var raw = localStorage.getItem('gojuon_learned'); var data = JSON.parse(raw || '[]');
      if (!Array.isArray(data) || data.length > 5000 || data.some(function(x) { return typeof x !== 'string'; })) return { status: 'invalid' };
      return { status: 'ok', learned: data };
    } catch (e) { return { status: 'unavailable' }; }
  }
  window.addEventListener('message', function(event) {
    if (event.origin !== target.origin || event.source !== parent || event.data?.type !== 'kotowa:legacy-request') return;
    parent.postMessage(Object.assign({ type: 'kotowa:legacy-kana' }, read()), target.origin);
  });
  document.getElementById('export').addEventListener('click', function() {
    var data = read();
    if (data.status !== 'ok') { document.getElementById('status').textContent = '无法读取旧记录，请在原来学习时使用的浏览器中重试。'; return; }
    var blob = new Blob([JSON.stringify({ format: 'kotowa-legacy-kana', version: 1, learned: data.learned })], {type: 'application/json'});
    var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = 'kotowa-kana-legacy.json'; a.click(); URL.revokeObjectURL(url);
    document.getElementById('status').textContent = '已导出 ' + data.learned.length + ' 项记录。';
  });
})();</script></body></html>`;
}
