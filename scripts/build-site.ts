/**
 * Generate the static website (GitHub Pages) into _site/.
 *
 *   /                       home: search, levels, tools
 *   /n5/ … /n1/             level hubs, with full vocab / kanji / grammar lists
 *   /vocab/<id>.html        one page per word
 *   /kanji/<hex>.html       one page per kanji (hex code point, e.g. 65e5 = 日)
 *   /grammar/<id>.html      one page per grammar point
 *   /flashcards.html, /analyzer.html, /data.html
 *   /data/*.json            minified data for the interactive tools
 *
 * Usage: SITE_URL=https://example.org/ tsx scripts/build-site.ts [outDir]
 */
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DATA_DIR, LEVELS, ROOT, type Level } from './lib/util.ts';
import type { Chinese } from '../src/index.ts';
import { POS_SHORT } from './lib/pos.ts';
import { messages, ui, uiAttr } from './lib/site-i18n.ts';
import { buildLearningData } from './lib/learning.ts';
import { learningPages, legacyMigrationPage, MODULE_TITLES } from './lib/learning-pages.ts';

// ---------------------------------------------------------------------------
// Data

interface Example { ja: string; furigana?: string; en: string; tatoeba_id?: number }
interface Vocab {
  zh?: Chinese;
  id: string; word: string; reading: string; romaji: string; meanings: string[]; level: Level;
  pos?: string[]; jmdict_id?: number; other_forms?: string[]; other_readings?: string[]; examples?: Example[];
}
interface Kanji {
  character: string; level: Level; strokes: number | null; grade: number | null; freq: number | null;
  radical: string | null; radical_number: number | null; onyomi: string[]; kunyomi: string[];
  nanori?: string[]; meanings: string[]; words?: string[]; supplementary?: true;
}
interface Grammar {
  zh?: Chinese;
  id: string; pattern: string; reading?: string; romaji: string; level: Level; meaning: string;
  formation: string; examples: Example[]; tags: string[]; notes?: string;
}

const OUT = process.argv[2] ?? join(ROOT, '_site');
const SITE_URL = (process.env.SITE_URL ?? 'https://AntaresGG.github.io/kotowa/').replace(/\/?$/, '/');
const REPO = process.env.REPO_URL ?? 'https://github.com/AntaresGG/kotowa';
const THEME_VERSION = createHash('sha256').update(readFileSync(join(ROOT, 'site/assets/theme.js'))).digest('hex').slice(0, 12);
const STYLE_VERSION = createHash('sha256').update(readFileSync(join(ROOT, 'site/assets/style.css'))).digest('hex').slice(0, 12);
const SILVER_VERSION = createHash('sha256').update(readFileSync(join(ROOT, 'site/assets/silver-era.css'))).digest('hex').slice(0, 12);
const I18N_SCRIPT = readFileSync(join(ROOT, 'site/assets/i18n.js'), 'utf8')
  .replace('/* LOCALE_MESSAGES */ {}', JSON.stringify(messages).replace(/</g, '\\u003c'));
const I18N_VERSION = createHash('sha256').update(I18N_SCRIPT).digest('hex').slice(0, 12);
const LEVEL_NAMES = LEVELS.map((l) => l.level);
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

const vocab = new Map<Level, Vocab[]>();
const kanji = new Map<Level, Kanji[]>();
const grammar = new Map<Level, Grammar[]>();
for (const level of LEVEL_NAMES) {
  const lc = level.toLowerCase();
  vocab.set(level, readJson(join(DATA_DIR, 'json', 'vocab', `${lc}.json`)));
  kanji.set(level, readJson(join(DATA_DIR, 'json', 'kanji', `${lc}.json`)));
  grammar.set(level, readJson(join(DATA_DIR, 'json', 'grammar', `${lc}.json`)));
}
const allVocab = [...vocab.values()].flat();
const allKanji = [...kanji.values()].flat();
const allGrammar = [...grammar.values()].flat();
const posLabels: Record<string, string> = readJson(join(DATA_DIR, 'json', 'pos.json'));
const meta = readJson<{ version: string; counts: Record<string, Record<string, number>>; sources?: Record<string, { created?: string }> }>(
  join(DATA_DIR, 'json', 'meta.json'),
);
const kanjiByChar = new Map(allKanji.map((k) => [k.character, k]));
const vocabByWord = new Map<string, Vocab>();
for (const v of allVocab) if (!vocabByWord.has(v.word)) vocabByWord.set(v.word, v);

// ---------------------------------------------------------------------------
// Helpers

const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const hex = (ch: string) => ch.codePointAt(0)!.toString(16);
/** File-name-safe text (Japanese is fine in URLs; a few ASCII characters are not). */
const safe = (s: string) => s.replace(/[\/\\?#%:*"<>|\s]/g, '_');

// Readable URLs: vocab/食べる.html, kanji/食.html. A homograph that is not the first
// (easiest) entry with its spelling gets the reading appended: vocab/上-うわ.html.
const vocabPaths = new Map<Vocab, string>();
{
  const taken = new Set<string>();
  for (const v of allVocab) {
    const base = safe(v.word);
    vocabPaths.set(v, taken.has(base) ? `vocab/${base}-${safe(v.reading)}.html` : `vocab/${base}.html`);
    taken.add(base);
  }
}
const vocabPath = (v: Vocab) => vocabPaths.get(v)!;
const kanjiPath = (ch: string) => `kanji/${ch}.html`;
const grammarPath = (g: Grammar) => `grammar/${g.id}.html`;
const learningData = buildLearningData(allVocab, allGrammar, new Map(allVocab.map(v => [v.id, vocabPath(v)])));
const lessonsByEntry = new Map<string, { module: keyof typeof MODULE_TITLES; id: string }[]>();
for (const [module, rows] of Object.entries(learningData)) for (const row of rows) {
  const keys = [...(row.vocab ? [`vocab:${row.vocab.id}`] : []), ...row.grammar.map(g => `grammar:${g.id}`)];
  for (const key of keys) lessonsByEntry.set(key, [...(lessonsByEntry.get(key) ?? []), { module: module as keyof typeof MODULE_TITLES, id: row.id }]);
}
const lessonLinks = (kind: string, id: string, root: string) => {
  const related = lessonsByEntry.get(`${kind}:${id}`);
  return related ? `<h2>${ui('Practice in a lesson')}</h2><div class="chips">${related.map(row =>
    `<a class="chip" href="${root}learn/${row.module}/#item=${encodeURIComponent(row.id)}">${ui(MODULE_TITLES[row.module])}</a>`).join('')}</div>` : '';
};
const absolute = (path: string) => SITE_URL + encodeURI(path.replace(/index\.html$/, ''));
const isKanjiChar = (ch: string) => /[㐀-䶿一-鿿豈-﫿々]/.test(ch);
const lvl = (l: Level) => `<span class="lvl ${l}">${l}</span>`;
const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

/**
 * Furigana: align the kana reading to the kanji runs of the word
 * (食べる + たべる → 食[た]べる). Falls back to the plain word when ambiguous.
 */
// Per-kanji furigana: 勉強 べんきょう → 勉(べん)強(きょう), when the kanji's own readings split
// the reading in exactly one way. Otherwise (jukujikun such as 今日, or kanji outside the
// dataset) the reading stays over the whole run.
const VOICED: Record<string, string> = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const SEMI: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };
const kanjiSounds = new Map<string, Set<string>>();
function soundsOf(ch: string): Set<string> {
  let out = kanjiSounds.get(ch);
  if (out) return out;
  out = new Set();
  const k = kanjiByChar.get(ch);
  const base = k ? [...k.onyomi, ...k.kunyomi].map((r) => toHira(r.split('.')[0].replace(/-/g, ''))).filter(Boolean) : [];
  for (const r of base) {
    out.add(r);
    const [first, rest] = [r[0], r.slice(1)];
    if (VOICED[first]) out.add(VOICED[first] + rest); // rendaku: 本棚 ほんだな
    if (SEMI[first]) out.add(SEMI[first] + rest); // 一本 いっぽん
    if (/[つちくき]$/.test(r) && r.length > 1) out.add(r.slice(0, -1) + 'っ'); // 学校 がっこう
  }
  kanjiSounds.set(ch, out);
  return out;
}

/** Split one kanji run's reading between its kanji, or return undefined if that isn't certain. */
function splitRun(run: string, rt: string): string[] | undefined {
  const chars = [...run];
  if (chars.length < 2) return undefined;
  const found: string[][] = [];
  const walk = (i: number, rest: string, acc: string[]) => {
    if (found.length > 1) return;
    if (i === chars.length) {
      if (rest === '') found.push(acc);
      return;
    }
    const sounds = chars[i] === '々' && i > 0 ? soundsOf(chars[i - 1]) : soundsOf(chars[i]);
    for (const s of sounds) if (rest.startsWith(s)) walk(i + 1, rest.slice(s.length), [...acc, s]);
  };
  walk(0, rt, []);
  return found.length === 1 ? found[0] : undefined;
}

/** <ruby> for a kanji run, one per kanji where the split is certain. */
function rubyRun(run: string, rt: string): string {
  const parts = splitRun(run, rt);
  if (!parts) return `<ruby>${esc(run)}<rt>${esc(rt)}</rt></ruby>`;
  return [...run].map((ch, i) => `<ruby>${esc(ch)}<rt>${esc(parts[i])}</rt></ruby>`).join('');
}

export function furigana(word: string, reading: string): string {
  const parts = word.match(/[㐀-䶿一-鿿豈-﫿々ヶ〆]+|[^㐀-䶿一-鿿豈-﫿々ヶ〆]+/g);
  if (!parts || parts.every((p) => !isKanjiChar(p[0]))) return esc(word);
  const pattern = parts.map((p) => (isKanjiChar(p[0]) ? '(.+?)' : `(${toHira(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`)).join('');
  const m = toHira(reading).match(new RegExp(`^${pattern}$`));
  if (!m) return esc(word);
  return parts
    .map((p, i) => (isKanjiChar(p[0]) ? rubyRun(p, m[i + 1]) : esc(p)))
    .join('');
}

// ---------------------------------------------------------------------------
// Layout

const NAV: [string, string][] = [
  ['n5/index.html', 'N5'], ['n4/index.html', 'N4'], ['n3/index.html', 'N3'], ['n2/index.html', 'N2'], ['n1/index.html', 'N1'],
  ['learn/index.html', 'Foundations'], ['flashcards.html', 'Flashcards'], ['analyzer.html', 'Analyzer'], ['data.html', 'Data'],
];

const GITHUB_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`;

interface Page {
  path: string;
  title: string;
  description: string;
  body: string;
  active?: string;
  scripts?: string[];
  styles?: string[];
  noindex?: boolean;
}

const pages: string[] = [];
const scriptVersions = new Map<string, string>();

/** Shared receiver faceplate; readings come from the dataset or the active flashcard deck. */
function silverReceiver(root: string, path: string): string {
  const flashcards = path === 'flashcards.html';
  const lesson = /^learn\/(kana|verbs|word-classes)\//.test(path);
  const dynamic = flashcards || lesson;
  const meter = (id: string, label: string, subtitle: string, value: number, maximum: number) => {
    const point = (angle: number, radius: number) => {
      const radians = angle * Math.PI / 180;
      return [120 + Math.sin(radians) * radius, 146 - Math.cos(radians) * radius];
    };
    const ticks = Array.from({ length: 26 }, (_, i) => {
      const [x1, y1] = point(-55 + i * 4.4, i % 5 === 0 ? 99 : 105);
      const [x2, y2] = point(-55 + i * 4.4, 112);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }).join('');
    const numbers = Array.from({ length: 6 }, (_, i) => {
      const [x, y] = point(-55 + i * 22, 86);
      return `<text x="${x}" y="${y}" text-anchor="middle">${maximum * i / 5}</text>`;
    }).join('');
    return `<div class="se-meter-unit">
<div class="se-meter" id="${id}" role="meter" aria-labelledby="${id}-label" aria-valuemin="0" aria-valuemax="${maximum}"${dynamic ? ' aria-valuetext="Loading…" data-i18n-aria-valuetext="Loading…"' : ` aria-valuenow="${value}"`} data-reading="${dynamic ? '' : value}" style="--needle-angle:${dynamic ? -55 : -55 + value / maximum * 110}deg">
<svg viewBox="0 0 240 152" aria-hidden="true" focusable="false"><path d="M28.25 81.76 A112 112 0 0 1 211.75 81.76" class="se-meter-arc"/><g class="se-meter-ticks">${ticks}</g><g class="se-meter-numbers">${numbers}</g><text x="120" y="104" text-anchor="middle" class="se-meter-title" data-i18n="${esc(subtitle)}">${subtitle}</text><text x="120" y="120" text-anchor="middle" class="se-meter-subtitle" data-i18n="${dynamic ? 'PROGRESS / %' : 'COLLECTION / COUNT'}">${dynamic ? 'PROGRESS / %' : 'COLLECTION / COUNT'}</text><line x1="120" y1="146" x2="120" y2="37" class="se-needle"/><circle cx="120" cy="146" r="6" class="se-pivot"/></svg>
</div><div class="se-meter-caption"><span id="${id}-label">${ui(label)}</span><output>${dynamic ? '—' : value.toLocaleString('en-US')}</output></div></div>`;
  };
  const c = meta.counts;
  const vocabularyMax = Math.ceil(c.vocab.total / 5000) * 5000;
  const kanjiMax = Math.ceil(c.kanji.total / 500) * 500;
  return `<section class="silver-only se-receiver" ${uiAttr("aria-label", "Kotowa learning receiver")}>
<div class="se-nameplate"><span>${ui("JAPANESE STUDY SYSTEM")}</span><a href="${root}index.html" ${uiAttr("aria-label", "Kotowa home")}>KOTOWA <small>词和</small></a><div class="se-nameplate-end"><span class="se-model">N<span>5</span> — N<span>1</span></span><button type="button" class="se-panel-toggle" id="se-panel-toggle" aria-expanded="true" aria-controls="se-faceplate">${ui("Collapse panel")}</button></div></div>
<div id="se-faceplate">
<div class="se-instruments">
<div class="se-controls"><span class="se-label">${ui("READING CONTROL")}</span><div class="se-control-pair">
<label class="se-dial" for="se-text-size"><span class="se-label">${ui("Text size")}</span><span class="se-dial-scale"><span class="se-knob" aria-hidden="true"></span><input id="se-text-size" type="range" min="0" max="2" step="1" value="1" ${uiAttr("aria-label", "Reading text size")} ${uiAttr("aria-valuetext", "Standard")}></span><output id="se-size-label" for="se-text-size">${ui("Standard")}</output></label>
<label class="se-furigana"><span class="se-label">${ui("Furigana")}</span><span class="se-toggle"><input type="checkbox" data-furigana ${uiAttr("aria-label", "Show furigana")} checked><span class="se-toggle-lever" aria-hidden="true"></span></span><span class="se-toggle-caption"><i class="se-lamp" aria-hidden="true"></i><span>${ui("FURIGANA")}</span></span></label>
</div></div>
<div class="se-meter-pair" id="se-meters" aria-busy="${dynamic}">${meter('se-meter-left', lesson ? 'Studied · this lesson' : flashcards ? 'Studied · this deck' : 'Vocabulary collection', dynamic ? 'STUDIED' : 'WORDS', c.vocab.total, dynamic ? 100 : vocabularyMax)}${meter('se-meter-right', lesson ? 'Quiz accuracy' : flashcards ? 'This session' : 'Kanji collection', lesson ? 'QUIZ' : flashcards ? 'SESSION' : 'KANJI', c.kanji.total, dynamic ? 100 : kanjiMax)}</div>
<div class="se-source"><span class="se-label">${ui("SOURCE SELECTOR")}</span><div class="se-source-keys"><a href="${root}index.html"${path === 'index.html' ? ' aria-current="page"' : ''}>${ui("Dictionary")}</a><a href="${root}flashcards.html"${flashcards ? ' aria-current="page"' : ''}>${ui("Flashcards")}</a><a href="${root}analyzer.html"${path === 'analyzer.html' ? ' aria-current="page"' : ''}>${ui("Analyze")}</a></div><div class="se-counter"><span class="se-label">${ui("Grammar collection")}</span><output>${String(c.grammar.total).padStart(4, '0')}</output></div><span class="se-label se-serial">${ui("SILVER ERA")} · <span lang="ja">ことばを、少しずつ。</span></span></div>
</div>
<div class="se-tuner"><span class="se-label">${ui("JLPT BAND")}</span><div class="se-tuner-track">${LEVEL_NAMES.map((level) => `<a href="${root}${level.toLowerCase()}/index.html"${path.startsWith(level.toLowerCase() + '/') ? ' aria-current="page"' : ''}><i aria-hidden="true"></i>${level}</a>`).join('')}</div><span class="se-label">${ui("N5 BEGINNER → N1 ADVANCED")}</span></div>
<div class="se-fascia-footer"><span>${ui("SONY Silver Era")}</span><span id="se-context">${flashcards ? ui("Loading deck…") : ui("VOCABULARY · KANJI · GRAMMAR")}</span></div>
</div>
</section>`;
}

function writePage(p: Page): void {
  const depth = p.path.split('/').length - 1;
  // The 404 page is served at arbitrary missing paths, so it needs absolute links.
  const root = p.path === '404.html' ? new URL(SITE_URL).pathname : '../'.repeat(depth);
  const url = absolute(p.path);
  const nav = NAV.map(([href, label]) => `<a href="${root}${href}"${p.active === href ? ' aria-current="page"' : ''}>${Object.hasOwn(messages, label) ? ui(label) : esc(label)}</a>`).join('');
  const scripts = ['assets/app.js', 'assets/silver-era.js', ...(p.scripts ?? [])].map((s) => {
    const version = scriptVersions.get(s) ?? createHash('sha256').update(readFileSync(join(ROOT, 'site', s))).digest('hex').slice(0, 12);
    scriptVersions.set(s, version);
    return `<script src="${root}${s}?v=${version}" defer></script>`;
  }).join('');
  const styles = (p.styles ?? []).map(s => {
    const version = createHash('sha256').update(readFileSync(join(ROOT, 'site', s))).digest('hex').slice(0, 12);
    return `<link rel="stylesheet" href="${root}${s}?v=${version}">`;
  }).join('');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(url)}">
${p.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kotowa · 词和">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE_URL}assets/kotowa-social.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#d7263d">
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<script src="${root}assets/i18n.js?v=${I18N_VERSION}"></script>
<script src="${root}assets/theme.js?v=${THEME_VERSION}"></script>
<link rel="stylesheet" href="${root}assets/style.css?v=${STYLE_VERSION}">
<link rel="stylesheet" href="${root}assets/silver-era.css?v=${SILVER_VERSION}">
${styles}
${scripts}
</head>
<body data-root="${root}"${p.path === 'flashcards.html' ? ' class="flashcard-page"' : ''}>
<header class="site-header"><div class="wrap">
<a class="brand" href="${root}index.html"><img class="brand-mark" src="${root}assets/favicon.svg" width="28" height="28" alt=""><span class="brand-name">Kotowa · 词和</span></a>
${p.path === 'index.html' ? '' : `<form class="hsearch" action="${root}index.html" role="search"><input type="search" name="q" ${uiAttr("placeholder", "Search words, kanji, grammar…")} ${uiAttr("aria-label", "Search")}></form>`}
<nav class="nav" ${uiAttr("aria-label", "Main navigation")}>${nav}</nav>
<label class="language-picker"><span class="sr-only">${ui("Interface language")}</span><select id="language-select" ${uiAttr("aria-label", "Interface language")}><option value="zh-CN" lang="zh-CN">中文</option><option value="en" lang="en" selected>English</option></select></label>
<div class="appearance-picker" role="group" ${uiAttr("aria-label", "Appearance")}><button class="theme-switch" id="theme-switch" type="button" role="switch" aria-checked="false" ${uiAttr("aria-label", "Lilac Mist theme")} ${uiAttr("title", "Warm Paper ↔ Lilac Mist")}><span class="theme-thumb" aria-hidden="true"></span><span class="theme-option theme-paper" aria-hidden="true"><i></i>${ui("Warm Paper")}</span><span class="theme-option theme-mist" aria-hidden="true"><i></i>${ui("Lilac Mist")}</span></button><button class="theme-silver" id="theme-silver" type="button" aria-pressed="false" ${uiAttr("title", "SONY Silver Era")}><i aria-hidden="true"></i>${ui("Silver Era")}</button></div>
<a class="gh-btn" href="${REPO}" rel="noopener">${GITHUB_ICON}<span>${ui("Star on GitHub")}</span></a>
</div></header>
${p.path === 'flashcards.html' ? '<div class="study-shell">' : ''}
<main><div class="wrap">
${silverReceiver(root, p.path)}
<div class="page-content">
${p.body}
</div></div></main>
<footer class="site-footer"><div class="wrap">
<p><strong>Kotowa · 词和</strong> — ${ui("N5–N1 Japanese study.")} <a href="${REPO}">GitHub</a> · <a href="${root}data.html">${ui("Download the data")}</a> · <a href="${REPO}/issues/new/choose">${ui("Report an error")}</a></p>
<p>${ui("Data")} <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a>. ${ui("Level lists by")} <a href="https://www.tanos.co.uk/jlpt/">Jonathan Waller</a> (CC BY);
${ui("dictionary data from")} <a href="https://www.edrdg.org/">JMdict &amp; KANJIDIC2 (EDRDG)</a>; ${ui("original examples and sentences from")} <a href="https://tatoeba.org">Tatoeba</a> (CC BY 2.0 FR); ${ui("based on")} <a href="https://github.com/evanclan/OpenJLPT">OpenJLPT</a>;
${ui("stroke order from")} <a href="https://kanjivg.tagaini.net/">KanjiVG</a> (CC BY-SA 3.0). ${ui("JLPT levels are unofficial: the JLPT does not publish word lists.")}</p>
</div></footer>
${p.path === 'flashcards.html' ? '</div>' : ''}
</body>
</html>
`;
  const file = join(OUT, p.path);
  mkdirSync(join(file, '..'), { recursive: true });
  // Link directory pages by their canonical URL (n5/, not n5/index.html).
  writeFileSync(file, html.replace(/(href="|"item":")([^"]*\/)?index\.html"/g, (_, attr: string, dir = '') => `${attr}${dir || './'}"`));
  if (!p.noindex) pages.push(url);
}

/** Breadcrumb trail, plus schema.org BreadcrumbList markup for search engines. */
const crumbs = (root: string, items: [string, string?][]) => {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [['Home', 'index.html'] as [string, string?], ...items].map(([name, href], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      ...(href ? { item: absolute(href) } : {}),
    })),
  };
  return `<nav class="crumbs" ${uiAttr("aria-label", "Breadcrumb")}><a href="${root}index.html">${ui("Home")}</a>${items
    .map(([label, href]) => ` › ${href ? `<a href="${root}${href}">${Object.hasOwn(messages, label) ? ui(label) : esc(label)}</a>` : (Object.hasOwn(messages, label) ? ui(label) : esc(label))}`)
    .join('')}</nav><script type="application/ld+json">${jsonLd(ld)}</script>`;
};

/** JSON for a <script> block: escape "<" so data can never close the tag. */
const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');

/** `{漢字|かんじ}` notation → <ruby>. */
const rubyHtml = (furigana: string) =>
  furigana
    .split(/(\{[^|{}]+\|[^|{}]+\})/)
    .map((part) => {
      const m = part.match(/^\{([^|{}]+)\|([^|{}]+)\}$/);
      return m ? rubyRun(m[1], m[2]) : esc(part);
    })
    .join('');

/** Section heading for example sentences, with a furigana switch when any sentence has furigana. */
const examplesHeading = (examples: Example[] | undefined) =>
  `<div class="ex-head"><h2>${ui("Examples")}</h2>${
    examples?.some((e) => e.furigana)
      ? '<label class="furi-toggle"><input type="checkbox" data-furigana checked> ' + ui("Furigana") + '</label>'
      : ''
  }</div>`;

const usableChinese = (entry: { zh?: Chinese }) => entry.zh?.status !== 'stale' ? entry.zh : undefined;
const bilingual = (entry: { zh?: Chinese }, english: string) => {
  const zh = usableChinese(entry);
  return zh ? zh.meanings.join('；') + ' / ' + english : english;
};
const chinesePanel = (entry: { zh?: Chinese }) => {
  const zh = usableChinese(entry);
  if (!zh) return '';
  return '<section lang="zh-CN"><h2>' + ui("Chinese meanings") + '</h2><p>' + esc(zh.meanings.join('；')) + '</p>'
    + (zh.formation ? '<h3>' + ui("Chinese formation") + '</h3><p>' + esc(zh.formation) + '</p>' : '')
    + (zh.explanation ? '<h3>' + ui("Chinese usage") + '</h3><p>' + esc(zh.explanation) + '</p>' : '')
    + (zh.notes ? '<h3>' + ui("Chinese notes") + '</h3><p>' + esc(zh.notes) + '</p>' : '') + '</section>';
};
const chineseExample = (entry: { zh?: Chinese }, ja: string) => usableChinese(entry)?.examples.find(e => e.ja === ja)?.zh;

const exampleList = (examples: Example[] | undefined, entry: { zh?: Chinese } = {}) =>
  examples?.length
    ? `<ul class="examples">${examples
        .map(
          (e) => `<li><div class="ja" lang="ja">${e.furigana ? rubyHtml(e.furigana) : esc(e.ja)}</div><div class="en">${esc(e.en)}</div>${chineseExample(entry, e.ja) ? `<div lang="zh-CN">${esc(chineseExample(entry, e.ja)!)}</div>` : ''}${
            e.tatoeba_id ? `<div class="src"><a href="https://tatoeba.org/en/sentences/show/${e.tatoeba_id}" rel="noopener">Tatoeba #${e.tatoeba_id}</a></div>` : ''
          }</li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">' + ui("No example sentence yet.") + '</p>';

const jsonBlock = (entry: unknown, snippet: string) => `<details class="json"><summary>${ui("Use this entry in code")}</summary>
<pre><code>${esc(snippet)}</code></pre>
<pre><code>${esc(JSON.stringify(entry, null, 2))}</code></pre></details>`;

const pager = (root: string, prev?: [string, string], next?: [string, string]) =>
  `<nav class="pager">${prev ? `<a href="${root}${prev[0]}">← ${esc(prev[1])}</a>` : '<span></span>'}${next ? `<a href="${root}${next[0]}">${esc(next[1])} →</a>` : '<span></span>'}</nav>`;

const reportUrl = (kind: string, entry: string) =>
  esc(`${REPO}/issues/new?template=data-error.yml&title=${encodeURIComponent(`Data error: ${entry}`)}&kind=${kind}&entry=${encodeURIComponent(entry)}`);

const speak = (text: string) => `<button class="speak" type="button" data-speak="${esc(text)}" ${uiAttr("title", "Listen")} ${uiAttr("aria-label", "Listen")}>🔊</button>`;

// ---------------------------------------------------------------------------
// Entry pages

function vocabPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = vocab.get(level)!;
    list.forEach((v, i) => {
      const root = '../';
      const kanjiCards = [...new Set(v.word)]
        .map((ch) => kanjiByChar.get(ch))
        .filter((k): k is Kanji => !!k)
        .map((k) => `<a class="kanji-link" href="${root}${kanjiPath(k.character)}"><span class="c">${esc(k.character)}</span><span>${lvl(k.level)}<br><span class="muted">${esc(truncate(k.meanings.slice(0, 3).join(', '), 40))}</span></span></a>`)
        .join('');
      const pos = [...new Set((v.pos ?? []).map((p) => POS_SHORT[p] ?? posLabels[p] ?? p))]
        .map((label) => `<span class="chip">${esc(label)}</span>`)
        .join('');
      const also = [
        v.other_forms?.length ? `<p class="muted"> ${ui("Also written")} <span lang="ja">${esc(v.other_forms.join('、'))}</span></p>` : '',
        v.other_readings?.length ? `<p class="muted"> ${ui("Also read")} <span lang="ja">${esc(v.other_readings.join('、'))}</span></p>` : '',
      ].join('');
      const reading = v.word === v.reading ? '' : `<span class="reading">${esc(v.reading)}</span>`;
      const gloss = v.meanings.slice(0, 3).join('; ');
      writePage({
        path: vocabPath(v),
        active: `${level.toLowerCase()}/index.html`,
        title: `${v.word} (${v.word === v.reading ? '' : `${v.reading}, `}${v.romaji}) meaning: ${truncate(gloss, 40)} — JLPT ${level} | Kotowa · 词和`,
        description: `${v.word} (${v.reading}, ${v.romaji}) means “${truncate(gloss, 90)}”. JLPT ${level} vocabulary with example sentences, part of speech and kanji breakdown.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Vocabulary', `${level.toLowerCase()}/vocab.html`], [v.word]])}
<div class="entry-head"><h1 class="headword" lang="ja">${furigana(v.word, v.reading)}</h1>${speak(v.reading)}${lvl(v.level)}</div>
<div>${reading} <span class="romaji">${esc(v.romaji)}</span></div>
<div class="two-col">
<section>
<ol class="meanings${v.meanings.length === 1 ? ' single' : ''}">${v.meanings.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
${pos ? `<div class="chips">${pos}</div>` : ''}
${also}
${chinesePanel(v)}
${examplesHeading(v.examples)}
${exampleList(v.examples, v)}
</section>
<aside>
${kanjiCards ? `<h2>${ui("Kanji")}</h2><div class="kanji-links">${kanjiCards}</div>` : ''}
<h2>${ui("Look up")}</h2>
<p><a href="https://jisho.org/word/${encodeURIComponent(v.word)}" rel="noopener">Jisho</a>${
          v.jmdict_id ? ` · <a href="https://www.edrdg.org/jmwsgi/entry.py?svc=jmdict&amp;q=${v.jmdict_id}" rel="noopener">JMdict #${v.jmdict_id}</a>` : ''
        } · <a href="${reportUrl('Vocabulary', `${v.word} (${level})`)}" rel="noopener">${ui("Report an error")}</a></p>
${lessonLinks('vocab', v.id, root)}
</aside>
</div>
${jsonBlock(v, `import { getVocabById } from 'kotowa';\ngetVocabById('${v.id}'); // ${v.word}`)}
${pager(root, list[i - 1] && [vocabPath(list[i - 1]), list[i - 1].word], list[i + 1] && [vocabPath(list[i + 1]), list[i + 1].word])}`,
      });
    });
  }
}

function kanjiPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = kanji.get(level)!;
    list.forEach((k, i) => {
      const root = '../';
      const words = (k.words ?? [])
        .map((w) => vocabByWord.get(w))
        .filter((v): v is Vocab => !!v)
        .map((v) => `<tr><td class="w"><a href="${root}${vocabPath(v)}" lang="ja">${esc(v.word)}</a></td><td class="r" lang="ja">${esc(v.reading)}</td><td>${esc(truncate(v.meanings.slice(0, 3).join('; '), 70))}</td><td>${lvl(v.level)}</td></tr>`)
        .join('');
      const cp = hex(k.character).padStart(5, '0');
      writePage({
        path: kanjiPath(k.character),
        active: `${level.toLowerCase()}/index.html`,
        title: `${k.character} kanji: ${truncate(k.meanings.slice(0, 3).join(', '), 36)} — readings, stroke order | JLPT ${level} · Kotowa · 词和`,
        description: `The kanji ${k.character} means “${truncate(k.meanings.join(', '), 60)}”. JLPT ${level}. On'yomi ${k.onyomi.join('、') || '—'}; kun'yomi ${k.kunyomi.join('、') || '—'}. ${k.strokes ?? '?'} strokes${k.radical ? `, radical ${k.radical}` : ''}. Example words and stroke order.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Kanji', `${level.toLowerCase()}/kanji.html`], [k.character]])}
<div class="two-col">
<section>
<div class="entry-head"><h1 class="kanji-big" lang="ja">${esc(k.character)}</h1>${lvl(k.level)}</div>
<ol class="meanings${k.meanings.length === 1 ? ' single' : ''}">${k.meanings.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
<dl class="kv">
<dt>${ui("On'yomi")}</dt><dd>${esc(k.onyomi.join('、') || '—')}</dd>
<dt>${ui("Kun'yomi")}</dt><dd>${esc(k.kunyomi.join('、') || '—')}</dd>
<dt>${ui("Strokes")}</dt><dd>${k.strokes ?? '—'}</dd>
<dt>${ui("Radical")}</dt><dd>${k.radical ? `${esc(k.radical)} <span class="muted">(#${k.radical_number})</span>` : '—'}</dd>
${k.grade ? `<dt>${ui("School grade")}</dt><dd>${k.grade <= 6 ? k.grade : k.grade === 8 ? ui("secondary (jōyō)") : ui("jinmeiyō")}</dd>` : ''}
${k.freq ? `<dt>${ui("Frequency")}</dt><dd>#${k.freq} <span class="muted">${ui("in newspapers")}</span></dd>` : ''}
${k.nanori?.length ? `<dt>${ui("Name readings")}</dt><dd>${esc(k.nanori.join('、'))}</dd>` : ''}
</dl>
${k.supplementary ? `<p class="muted" style="font-size:14px">${ui(k.words?.length ? "Not in Waller’s JLPT lists (which predate the 2010 jōyō revision): placed at {level} because OpenJLPT words at that level use it." : "Not in Waller’s JLPT lists (which predate the 2010 jōyō revision): placed at {level} to complete the jōyō kanji.", { level: k.level })}</p>` : ''}
</section>
<aside>
<h2>${ui("Stroke order")}</h2>
<img class="strokes-img" src="https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji/${cp}.svg" alt="Stroke order diagram for ${esc(k.character)}" data-i18n-alt="Stroke order diagram for {character}" data-i18n-params="${esc(JSON.stringify({ character: k.character }))}" loading="lazy" width="220" height="220">
<p class="muted" style="font-size:13px">${ui("Diagram:")} <a href="https://kanjivg.tagaini.net/">KanjiVG</a>, CC BY-SA 3.0</p>
</aside>
</div>
${words ? `<h2>${ui("Words with {character}", { character: k.character })}</h2><table class="list"><tbody>${words}</tbody></table>` : ''}
<p class="muted" style="margin-top:24px"><a href="https://jisho.org/search/${encodeURIComponent(k.character)}%20%23kanji" rel="noopener">Jisho</a> · <a href="${reportUrl('Kanji', `${k.character} (${level})`)}" rel="noopener">${ui("Report an error")}</a></p>
${jsonBlock(k, `import { findKanji } from 'kotowa';\nfindKanji('${k.character}');`)}
${pager(root, list[i - 1] && [kanjiPath(list[i - 1].character), list[i - 1].character], list[i + 1] && [kanjiPath(list[i + 1].character), list[i + 1].character])}`,
      });
    });
  }
}

function grammarPages(): void {
  for (const level of LEVEL_NAMES) {
    const list = grammar.get(level)!;
    list.forEach((g, i) => {
      const root = '../';
      const related = list
        .filter((o) => o !== g && o.tags.some((t) => g.tags.includes(t)))
        .slice(0, 8)
        .map((o) => `<a class="chip" href="${root}${grammarPath(o)}" lang="ja">${esc(o.pattern)}</a>`)
        .join('');
      writePage({
        path: grammarPath(g),
        active: `${level.toLowerCase()}/index.html`,
        title: `${g.pattern} (${g.romaji}) — ${truncate(g.meaning, 44)} | JLPT ${level} grammar · Kotowa · 词和`,
        description: `JLPT ${level} grammar: ${g.pattern} (${g.romaji}) — ${truncate(g.meaning, 80)}. Formation: ${truncate(g.formation, 60)}. With example sentences and usage notes.`,
        body: `${crumbs(root, [[`JLPT ${level}`, `${level.toLowerCase()}/index.html`], ['Grammar', `${level.toLowerCase()}/grammar.html`], [g.pattern]])}
<div class="entry-head"><h1 class="headword" lang="ja" style="font-size:clamp(34px,6vw,54px)">${esc(g.pattern)}</h1>${lvl(g.level)}</div>
<div>${g.reading ? `<span class="reading">${esc(g.reading)}</span> ` : ''}<span class="romaji">${esc(g.romaji)}</span></div>
<p style="font-size:21px;margin:14px 0">${esc(g.meaning)}</p>
<h2>${ui("Formation")}</h2>
<div class="formation">${esc(g.formation)}</div>
${chinesePanel(g)}
${examplesHeading(g.examples)}
${exampleList(g.examples, g)}
${g.notes ? `<h2>${ui("Notes")}</h2><p class="note">${esc(g.notes)}</p>` : ''}
<div class="chips">${g.tags.map((t) => `<span class="chip">#${esc(t)}</span>`).join('')}</div>
${related ? `<h2>${ui("Related {level} grammar", { level })}</h2><div class="chips">${related}</div>` : ''}
${lessonLinks('grammar', g.id, root)}
<p class="muted" style="margin-top:24px"><a href="${reportUrl('Grammar', `${g.pattern} (${level})`)}" rel="noopener">${ui("Suggest an improvement")}</a></p>
${jsonBlock(g, `import { getGrammarById } from 'kotowa';\ngetGrammarById('${g.id}');`)}
${pager(root, list[i - 1] && [grammarPath(list[i - 1]), list[i - 1].pattern], list[i + 1] && [grammarPath(list[i + 1]), list[i + 1].pattern])}`,
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Level pages

const cdnBase = SITE_URL.replace(/\/$/, '');

/** Filter box, self-test toggles and download links above a level list. */
function listTools(lc: string, kind: 'vocab' | 'grammar', target: string, readings: boolean): string {
  return `<div class="list-tools">
<input class="filter" type="search" ${uiAttr("placeholder", "Filter (kanji, kana, romaji, Chinese or English)…")} data-filter="${target}" ${uiAttr("aria-label", "Filter")}>
${kind === 'vocab' ? `<label><input type="checkbox" data-hide="r" data-target="${target}"> ${ui("Hide readings")}</label>` : ''}
<label><input type="checkbox" data-hide="m" data-target="${target}"> ${ui("Hide meanings")}</label>
<span class="dl"> ${ui("Download:")} <a href="../dataset/csv/${kind}-${lc}.csv">CSV</a> · <a href="../dataset/json/${kind}/${lc}.json">JSON</a> · <a href="../downloads/openjlpt-${lc}-${kind}.apkg">Anki</a></span>
</div>`;
}

const levelBlurb: Record<Level, string> = {
  N5: 'Beginner. Basic phrases, hiragana, katakana and the first ~100 kanji.',
  N4: 'Upper beginner. Everyday conversation on familiar topics.',
  N3: 'Intermediate. The bridge between textbook and real-world Japanese.',
  N2: 'Upper intermediate. Newspapers, business and general-purpose Japanese.',
  N1: 'Advanced. Complex, abstract and literary Japanese.',
};

function levelPages(): void {
  for (const level of LEVEL_NAMES) {
    const lc = level.toLowerCase();
    const root = '../';
    const v = vocab.get(level)!;
    const k = kanji.get(level)!;
    const g = grammar.get(level)!;

    writePage({
      path: `${lc}/index.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} — ${v.length.toLocaleString('en-US')} words, ${k.length} kanji, ${g.length} grammar points | Kotowa · 词和`,
      description: `Everything for the JLPT ${level}: ${plural(v.length, 'vocabulary word')}, ${plural(k.length, 'kanji')} and ${plural(g.length, 'grammar point')} with readings, meanings and example sentences. Free and open data.`,
      body: `${crumbs(root, [[`JLPT ${level}`]])}
<h1>JLPT ${level} ${lvl(level)}</h1>
<p class="lead">${ui(levelBlurb[level])}</p>
<div class="grid grid-3" style="margin-top:22px">
<a class="card level-card" href="vocab.html"><div class="big">${v.length.toLocaleString('en-US')}</div><div>${ui("vocabulary words →")}</div><ul><li lang="ja">${v.slice(0, 6).map((x) => esc(x.word)).join('、')}…</li></ul></a>
<a class="card level-card" href="kanji.html"><div class="big">${k.length.toLocaleString('en-US')}</div><div>${ui("kanji →")}</div><ul><li lang="ja" style="font-size:22px">${k.slice(0, 10).map((x) => esc(x.character)).join(' ')}</li></ul></a>
<a class="card level-card" href="grammar.html"><div class="big">${g.length}</div><div>${ui("grammar points →")}</div><ul><li lang="ja">${g.slice(0, 5).map((x) => esc(x.pattern)).join('、')}…</li></ul></a>
</div>
<div class="btn-row"><a class="btn primary" href="${root}flashcards.html#${level}">${ui("Study {level} with flashcards", { level })}</a><a class="btn" href="${root}data.html">${ui("Download {level} as JSON / CSV / Anki", { level })}</a></div>`,
    });

    writePage({
      path: `${lc}/vocab.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Vocabulary List — all ${v.length.toLocaleString('en-US')} words with readings and meanings`,
      description: `The complete JLPT ${level} vocabulary list: ${plural(v.length, 'word')} with kana readings, romaji, English meanings and example sentences. Free to download as JSON, CSV or SQLite.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Vocabulary']])}
<h1>JLPT ${level} ${ui("Vocabulary")} <span class="muted" style="font-size:0.6em">${ui("{count} words", { count: v.length.toLocaleString('en-US') })}</span></h1>
${listTools(lc, 'vocab', '#vlist', true)}
<table class="list" id="vlist"><thead><tr><th>${ui("Word")}</th><th class="r">${ui("Reading")}</th><th>${ui("Meaning")}</th></tr></thead><tbody>
${v.map((x) => `<tr data-s="${esc(`${x.word} ${x.reading} ${x.romaji} ${x.meanings.join(' ')} ${usableChinese(x)?.meanings.join(' ') ?? ''}`.toLowerCase())}"><td class="w"><a href="${root}${vocabPath(x)}" lang="ja">${esc(x.word)}</a>${x.word === x.reading ? '' : `<span class="r-m" lang="ja">${esc(x.reading)}</span>`}</td><td class="r" lang="ja"><span>${esc(x.reading)}</span></td><td class="m"><span>${esc(truncate(bilingual(x, x.meanings.join('; ')), 130))}</span></td></tr>`).join('\n')}
</tbody></table>`,
    });

    writePage({
      path: `${lc}/kanji.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Kanji List — ${k.length} kanji with readings, meanings and stroke order`,
      description: `All ${k.length} JLPT ${level} kanji with on'yomi, kun'yomi, English meanings, stroke counts, radicals, stroke order and example words.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Kanji']])}
<h1>JLPT ${level} ${ui("Kanji")} <span class="muted" style="font-size:0.6em">${k.length}</span></h1>
<p class="muted"> ${ui("Most frequent first.")} <a href="../dataset/csv/kanji-${lc}.csv">CSV</a> · <a href="../dataset/json/kanji/${lc}.json">JSON</a> · <a href="${root}downloads/openjlpt-${lc}-kanji.apkg">${ui("Anki deck")}</a></p>
<div class="kanji-grid">${k.map((x) => `<a href="${root}${kanjiPath(x.character)}" title="${esc(x.meanings.slice(0, 3).join(', '))}" lang="ja">${esc(x.character)}<small>${esc(x.meanings[0] ?? '')}</small></a>`).join('')}</div>`,
    });

    writePage({
      path: `${lc}/grammar.html`,
      active: `${lc}/index.html`,
      title: `JLPT ${level} Grammar List — ${g.length} grammar points with examples`,
      description: `All ${g.length} JLPT ${level} grammar points with meanings, formation rules, example sentences and usage notes.`,
      body: `${crumbs(root, [[`JLPT ${level}`, `${lc}/index.html`], ['Grammar']])}
<h1>JLPT ${level} ${ui("Grammar")} <span class="muted" style="font-size:0.6em">${ui("{count} points", { count: g.length })}</span></h1>
${listTools(lc, 'grammar', '#glist', false)}
<ul class="gram-list" id="glist">${g.map((x) => `<li data-s="${esc(`${x.pattern} ${x.reading ?? ''} ${x.romaji} ${x.meaning} ${x.tags.join(' ')}`.toLowerCase())}"><a href="${root}${grammarPath(x)}"><span class="p" lang="ja">${esc(x.pattern)}</span><span class="m"><span>${esc(bilingual(x, x.meaning))}</span></span></a></li>`).join('')}</ul>`,
    });
  }
}

// ---------------------------------------------------------------------------
// Home and tools

const levelShort: Record<Level, string> = { N5: 'Beginner', N4: 'Elementary', N3: 'Intermediate', N2: 'Upper intermediate', N1: 'Advanced' };

function homePage(): void {
  const c = meta.counts;
  const updated = meta.sources?.jmdict?.created;
  const levelCards = LEVEL_NAMES.map(
    (l) => `<a class="card level-card" href="${l.toLowerCase()}/index.html"><div class="lv" style="color:var(--${l.toLowerCase()})">${l}</div><div class="lv-sub">${ui(levelShort[l])}</div><ul>
<li>${ui("{count} words", { count: c.vocab[l].toLocaleString('en-US') })}</li><li>${ui("{count} kanji", { count: c.kanji[l].toLocaleString('en-US') })}</li><li>${ui("{count} grammar points", { count: c.grammar[l] })}</li></ul></a>`,
  ).join('');
  writePage({
    path: 'index.html',
    title: 'Kotowa · 词和 — JLPT N5–N1 vocabulary, kanji and grammar lists, free and open',
    description: `Free, open JLPT dataset and study site: ${c.vocab.total.toLocaleString('en-US')} vocabulary words, ${c.kanji.total.toLocaleString('en-US')} kanji and ${c.grammar.total} grammar points for N5–N1, with example sentences. Search, flashcards, text analyzer, and downloads as JSON, CSV, SQLite and Anki.`,
    body: `<section class="hero">
<h1>Kotowa · 词和<br><span class="accent">${ui("N5–N1 Japanese study")}</span></h1>
<p class="lead">${ui("Search {words} words, {kanji} kanji and {grammar} grammar points from N5 to N1 — with Chinese vocabulary and grammar explanations, translated examples, and furigana where available. Or grab the whole dataset for your own app.", { words: c.vocab.total.toLocaleString('en-US'), kanji: c.kanji.total.toLocaleString('en-US'), grammar: c.grammar.total })}</p>
<div class="search" id="search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
<input id="q" type="search" ${uiAttr("placeholder", "Try 肥皂, eat, 食べる, taberu or てもいい")} autocomplete="off" ${uiAttr("aria-label", "Search words, kanji and grammar")}></div>
<ul class="results" id="results" aria-live="polite"></ul>
<div class="btn-row quick"><a class="btn" href="learn/index.html">${ui("Foundations")}</a><a class="btn" href="n5/index.html">${ui("📚 Start with N5")}</a><a class="btn" href="data.html#anki">${ui("🃏 Anki decks")}</a><a class="btn" href="analyzer.html">${ui("🔍 What level is this text?")}</a><a class="btn" href="flashcards.html">${ui("🔁 Flashcards")}</a></div>
<p class="muted small">${ui("Levels follow")} <a href="https://www.tanos.co.uk/jlpt/" rel="noopener">${ui("Jonathan Waller's community lists")}</a>${ui("; the JLPT has not published official lists since 2010. Based on JMdict and reviewed source updates")}${updated ? ` · ${ui("data updated {date}", { date: updated })}` : ''}.</p>
<div class="stats">
<div class="stat"><b>${c.vocab.total.toLocaleString('en-US')}</b><span>${ui("words")}</span></div>
<div class="stat"><b>${c.kanji.total.toLocaleString('en-US')}</b><span>${ui("kanji")}</span></div>
<div class="stat"><b>${c.grammar.total}</b><span>${ui("grammar points")}</span></div>
<div class="stat"><b>5</b><span>${ui("levels, N5 → N1")}</span></div>
</div>
</section>
<h2>${ui("Browse by level")}</h2>
<div class="grid grid-5">${levelCards}</div>
<h2>${ui("Study tools")}</h2>
<div class="grid grid-3">
<a class="card level-card" href="learn/index.html"><h3 style="margin-top:0">${ui("Foundations")}</h3><p class="muted">${ui("Start with kana, build word and grammar skills, then review with flashcards.")}</p></a>
<a class="card level-card" href="flashcards.html"><h3 style="margin-top:0">${ui("🃏 Flashcards")}</h3><p class="muted">${ui("Spaced-repetition review for any level — words, kanji or grammar. Progress saves in your browser.")}</p></a>
<a class="card level-card" href="analyzer.html"><h3 style="margin-top:0">${ui("🔍 Text analyzer")}</h3><p class="muted">${ui("Paste any Japanese text and see which JLPT level each kanji belongs to.")}</p></a>
<a class="card level-card" href="data.html"><h3 style="margin-top:0">${ui("📦 Data & API")}</h3><p class="muted">${ui("JSON, CSV, SQLite and Anki downloads, a CDN, and loaders for JavaScript and Python.")}</p></a>
</div>
<h2>${ui("Built for developers")}</h2>
<p class="muted">${ui("The same data powers this site and can power your app: free to use, including commercially, under CC BY-SA 4.0.")}</p>
<pre><code>npm install git+https://github.com/AntaresGG/kotowa.git#main

import { findWord, getGrammar } from 'kotowa';
findWord('食べる');   // { reading: 'たべる', level: 'N5', pos: ['v1','vt'], examples: [...] }
getGrammar('N4');     // ${c.grammar.N4} grammar points with examples</code></pre>
<div class="btn-row"><a class="btn primary" href="${REPO}">${GITHUB_ICON} ${ui("Kotowa · 词和 on GitHub")}</a><a class="btn" href="data.html">${ui("Get the data")}</a></div>`,
    scripts: ['assets/search.js'],
  });
}

function toolPages(): void {
  writePage({
    path: 'flashcards.html',
    active: 'flashcards.html',
    title: 'JLPT Flashcards — free spaced repetition for N5–N1 | Kotowa · 词和',
    description: 'Free JLPT flashcards in your browser: vocabulary, kanji and grammar for N5 to N1 with spaced repetition. No sign-up; progress is saved locally.',
    scripts: ['assets/flashcards.js'],
    body: `<div class="fc">
<div class="fc-heading">
<h1>${ui("Flashcards")}</h1>
<p class="muted">${ui("Spaced repetition in your browser. Progress is stored on this device only.")}</p>
</div>
<div class="fc-setup">
<div class="seg" id="fc-mode" role="group" ${uiAttr("aria-label", "Study mode")}><button type="button" data-v="daily" aria-pressed="true">${ui("Daily review")}</button><button type="button" data-v="focus" aria-pressed="false">${ui("★ Focused review")}</button></div>
<p class="muted" id="fc-mode-help"></p>
<div class="btn-row fc-deck-controls" style="justify-content:center">
<div class="seg" id="fc-level" role="group" ${uiAttr("aria-label", "Level")}>${LEVEL_NAMES.map((l, i) => `<button type="button" data-v="${l}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div>
<div class="seg" id="fc-kind" role="group" ${uiAttr("aria-label", "Deck")}><button type="button" data-v="vocab" aria-pressed="true">${ui("Words")}</button><button type="button" data-v="kanji" aria-pressed="false">${ui("Kanji")}</button><button type="button" data-v="grammar" aria-pressed="false">${ui("Grammar")}</button></div>
</div>
<p class="fc-shuffle"><label ${uiAttr("title", "Keep the current card and shuffle the remaining cards. New sessions also pick new cards randomly.")}><input type="checkbox" id="fc-shuffle"> ${ui("Shuffle")}</label></p>
<p class="fc-save"><button class="btn" type="button" id="fc-mark" aria-pressed="false" disabled>${ui("☆ Save for focused review")}</button></p>
</div>
<p class="muted" id="fc-status" role="status">${ui("Loading…")}</p>
<p class="muted" id="fc-focus-message" role="status"></p>
<div class="fc-workspace">
<section id="fc-overview" class="fc-overview" ${uiAttr("aria-label", "Study progress")} hidden>
<div class="fc-overview-heading"><strong id="fc-deck-name"></strong><span class="muted">${ui("Self-rated progress")}</span></div>
<div class="fc-deck-progress">
<div class="fc-donut" id="fc-donut" role="img" ${uiAttr("aria-label", "Deck progress")}><div aria-hidden="true"><strong id="fc-studied-percent"></strong><span>${ui("studied")}</span></div></div>
<div class="fc-deck-breakdown">
<p class="fc-studied"><strong id="fc-studied"></strong><span class="muted"> / <span id="fc-deck-total"></span> ${ui("studied")}</span></p>
<dl class="fc-legend">
<div><dt><i class="fc-dot fc-new" aria-hidden="true"></i>${ui("Not started")}</dt><dd id="fc-new-count"></dd></div>
<div><dt><i class="fc-dot fc-learning" aria-hidden="true"></i>${ui("Learning")}</dt><dd id="fc-learning-count"></dd></div>
<div><dt><i class="fc-dot fc-learned" aria-hidden="true"></i>${ui("Learned")}</dt><dd id="fc-learned-count"></dd></div>
</dl>
</div>
</div>
<div class="fc-session">
<div class="fc-session-heading"><strong>${ui("This session")}</strong><span><strong id="fc-remaining"></strong> ${ui("to review")}</span></div>
<div class="fc-progress" id="fc-session-progress" role="progressbar" ${uiAttr("aria-label", "Session completion")} aria-valuemin="0" aria-valuemax="100"><div id="fc-bar"></div></div>
<p id="fc-session-caption" class="muted"></p>
</div>
<details class="fc-progress-help"><summary>${ui("What do these numbers mean?")}</summary>
<p><strong>${ui("To review")}</strong> ${ui("counts cards not yet marked Knew it in this session. Previous and Next browse the whole session without changing progress, including cards already marked Knew it.")}</p>
<p><strong>${ui("Studied")}</strong> ${ui("includes every card rated at least once: Learning + Learned.")} <strong>${ui("Learned")}</strong> ${ui("means choosing Knew it in at least two daily sessions. Each card is rated once per session. This is self-rated recall, not a quiz result; learned cards still need review.")}</p>
<p>${ui("Only Knew it records a rating and advances to an unfinished card. These deck totals track daily review only; Focused review does not change them or your daily schedule. Each mode resumes its own session when you return today.")}</p>
</details>
</section>
<div class="fc-stage">
<div class="card fc-card" id="fc-card" tabindex="0" aria-live="polite"><div class="fc-front" lang="ja" id="fc-front"></div><div class="fc-back" id="fc-back"></div></div>
<div id="fc-complete" hidden>
<div class="btn-row" style="justify-content:center">
<button class="btn primary" type="button" id="fc-next">${ui("Continue with next group")}</button>
<button class="btn" type="button" id="fc-choose">${ui("Choose another deck")}</button>
<a class="btn" href="index.html" id="fc-home">${ui("Back to home")}</a>
</div>
</div>
<div class="btn-row fc-actions" style="justify-content:center">
<button class="btn" type="button" id="fc-previous" aria-keyshortcuts="ArrowLeft">${ui("Previous")} <span class="kbd">←</span></button>
<button class="btn" type="button" id="fc-flip" aria-keyshortcuts="ArrowUp">${ui("Show")} <span class="kbd">↑</span></button>
<button class="btn" type="button" id="fc-forward" aria-keyshortcuts="ArrowRight">${ui("Next")} <span class="kbd">→</span></button>
<button class="btn primary" type="button" id="fc-good" aria-keyshortcuts="ArrowDown" aria-pressed="false">${ui("✓ Knew it")} <span class="kbd">↓</span></button>
</div>
</div>
<p class="fc-reset"><button class="btn" type="button" id="fc-reset" style="font-size:13px;padding:6px 12px">${ui("Reset progress for this deck")}</button></p>
<details id="fc-focus-library" class="fc-focus-library" hidden>
<summary>${ui("★ Saved cards in this deck")} (<span id="fc-focus-count">0</span>)</summary>
<p class="muted">${ui("Use the level and deck selectors to view your saved collection. Stored in this browser only.")}</p>
<p id="fc-focus-empty" class="muted">${ui("No saved cards yet. Use ☆ above a flashcard to add it.")}</p>
<ul id="fc-focus-list"></ul>
</details>
</div>
</div>`,
  });

  writePage({
    path: 'analyzer.html',
    active: 'analyzer.html',
    title: 'What JLPT level is this text? — Japanese kanji level analyzer | Kotowa · 词和',
    description: 'Paste any Japanese text to see the JLPT level (N5–N1) of every kanji, color-coded, with a level breakdown. Free and runs in your browser.',
    scripts: ['assets/analyzer.js'],
    body: `<h1>${ui("What JLPT level is this text?")}</h1>
<p class="lead">${ui("Paste Japanese text: every kanji is colored by its JLPT level. Click one to look it up.")}</p>
<textarea class="analyze" id="text" lang="ja" ${uiAttr("aria-label", "Japanese text")}>吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。何でも薄暗いじめじめした所でニャーニャー泣いていた事だけは記憶している。</textarea>
<div class="legend" style="margin-top:12px">${LEVEL_NAMES.map((l) => `<span class="k-${l}"><i style="background:var(--${l.toLowerCase()})"></i>${l}</span>`).join('')}<span><i style="background:var(--none)"></i>${ui("not in JLPT lists")}</span></div>
<div class="bar" id="bar"></div>
<p id="summary" class="muted"></p>
<div class="card"><div class="marked" id="marked" lang="ja"></div></div>
<div class="btn-row"><button class="btn" type="button" id="share">${ui("🔗 Copy link to this analysis")}</button></div>
<p class="muted" style="font-size:14px">${ui("Levels are also marked by underline: N5 none, N4 dotted, N3 dashed, N2 solid, N1 double. Only kanji are analysed — kana and vocabulary are not.")}</p>`,
  });

  const cdn = SITE_URL.replace(/\/$/, '');
  writePage({
    path: 'data.html',
    active: 'data.html',
    title: 'Download the JLPT dataset — JSON, CSV, SQLite, Anki | Kotowa · 词和',
    description: 'Download every JLPT N5–N1 word, kanji and grammar point as JSON, CSV or SQLite, or install the loaders from the project repository. CC BY-SA 4.0.',
    body: `<h1>${ui("Data & API")}</h1>
<p class="lead">${ui("All data is free to use — including commercially — under")} <a href="${REPO}/blob/main/LICENSE">CC BY-SA 4.0</a>, ${ui("with attribution to Kotowa, OpenJLPT and the")} <a href="${REPO}/blob/main/NOTICE.md">${ui("upstream sources")}</a>.</p>
<h2>${ui("Download")}</h2>
<table class="list"><thead><tr><th>${ui("Level")}</th><th>${ui("Vocabulary")}</th><th>${ui("Kanji")}</th><th>${ui("Grammar")}</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => {
  const lc = l.toLowerCase();
  return `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="dataset/json/${k}/${lc}.json">JSON</a> · <a href="dataset/csv/${k}-${lc}.csv">CSV</a></td>`).join('')}</tr>`;
}).join('')}
</tbody></table>
<div class="btn-row"><a class="btn primary" href="downloads/openjlpt-data.zip">${ui("⬇ Everything: JSON + CSV + SQLite (zip)")}</a><a class="btn" href="dataset/openjlpt.sqlite">${ui("⬇ SQLite database")}</a></div>
<p class="muted small">${ui("Spreadsheet or pandas? Every CSV loads straight from the CDN:")} <code>pd.read_csv("${cdn}/dataset/csv/vocab-n5.csv")</code></p>
<h2 id="anki">${ui("Anki decks")}</h2>
<p>${ui("Ready-made")} <a href="https://apps.ankiweb.net/">Anki</a> ${ui("decks with furigana, example sentences and text-to-speech. Re-importing a newer version updates your cards and keeps your review history.")}</p>
<table class="list"><thead><tr><th>${ui("Level")}</th><th>${ui("Vocabulary")}</th><th>${ui("Kanji")}</th><th>${ui("Grammar")}</th></tr></thead><tbody>
${LEVEL_NAMES.map((l) => `<tr><td>${lvl(l)}</td>${(['vocab', 'kanji', 'grammar'] as const).map((k) => `<td><a href="downloads/openjlpt-${l.toLowerCase()}-${k}.apkg">⬇ ${ui(k === 'vocab' ? '{count} words' : k === 'kanji' ? '{count} kanji' : '{count} points', { count: meta.counts[k][l].toLocaleString('en-US') })}</a></td>`).join('')}</tr>`).join('')}
</tbody></table>
<p><a class="btn primary" href="downloads/openjlpt-complete.apkg">${ui("⬇ Everything in one deck (N5–N1)")}</a></p>
<h2 id="yomitan">${ui("Yomitan dictionary")}</h2>
<p>${ui("See the JLPT level of any word or kanji right in the")} <a href="https://yomitan.wiki/">Yomitan</a> <a href="downloads/openjlpt-yomitan.zip">⬇ openjlpt-yomitan.zip</a>, ${ui("then import it in Yomitan settings → Dictionaries. When data is refreshed, use Dictionaries → Check for updates.")}</p>
<h2>${ui("CDN (no install)")}</h2>
<p>${ui("Fetch the dataset directly from this deployment:")}</p>
<pre><code>const n5 = await fetch('${cdn}/dataset/json/vocab/n5.json').then(r =&gt; r.json());</code></pre>
<h2>JavaScript / TypeScript</h2>
<pre><code>npm install git+https://github.com/AntaresGG/kotowa.git#main

import { getVocab, findWord, findKanji, searchVocab, getGrammar } from 'kotowa';
getVocab('N5');            // ${meta.counts.vocab.N5} words, fully typed
findKanji('日');           // { strokes: 4, radical: '日', onyomi: ['ニチ','ジツ'], words: [...] }
searchVocab('taberu');     // kanji, kana, romaji or English
getGrammar('N3');          // ${meta.counts.grammar.N3} grammar points

kotowa 食べる         # command-line lookup (also: kanji, grammar, quiz, random)</code></pre>
<h2>Python</h2>
<pre><code>uv pip install "git+https://github.com/AntaresGG/kotowa.git@main"

from openjlpt import get_vocab, find_word, search_vocab, query
find_word("食べる").meanings          # ['to eat']
query("SELECT word, reading FROM vocab WHERE level = 'N5' LIMIT 5")</code></pre>
<h2>SQLite</h2>
<pre><code>-- full-text search over words, readings, romaji and meanings
SELECT v.word, v.reading, v.level
FROM vocab_fts f JOIN vocab v ON v.rowid = f.rowid
WHERE vocab_fts MATCH 'weather';</code></pre>
<h2>${ui("Schema")}</h2>
<p>${ui("Every file is validated in CI against")} <a href="${REPO}/tree/main/schema">JSON Schemas</a>. ${ui("See the")} <a href="${REPO}#readme">README</a> ${ui("for field-by-field documentation.")}</p>
<script type="application/ld+json">${jsonLd({
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: 'Kotowa · 词和',
  description: `Open JLPT N5–N1 dataset: ${meta.counts.vocab.total} vocabulary words, ${meta.counts.kanji.total} kanji and ${meta.counts.grammar.total} grammar points with readings, meanings, part of speech and example sentences.`,
  url: SITE_URL,
  sameAs: REPO,
  license: 'https://creativecommons.org/licenses/by-sa/4.0/',
  isAccessibleForFree: true,
  version: meta.version,
  creator: { '@type': 'Organization', name: 'AntaresGG and Kotowa contributors', url: REPO },
  keywords: ['JLPT', 'Japanese', 'vocabulary', 'kanji', 'grammar', 'language learning', 'JMdict', 'Tatoeba'],
  inLanguage: ['ja', 'en'],
  ...(meta.sources?.jmdict?.created ? { dateModified: meta.sources.jmdict.created } : {}),
  citation: `AntaresGG and contributors. Kotowa · 词和: Chinese JLPT learning data, based on OpenJLPT (version ${meta.version}). ${REPO}`,
  isBasedOn: [
    { '@type': 'Dataset', name: 'JMdict', url: 'https://www.edrdg.org/jmdict/j_jmdict.html' },
    { '@type': 'Dataset', name: 'KANJIDIC2', url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project' },
    { '@type': 'Dataset', name: 'Tatoeba', url: 'https://tatoeba.org' },
    { '@type': 'Dataset', name: "Jonathan Waller's JLPT lists", url: 'https://www.tanos.co.uk/jlpt/' },
  ],
  distribution: [
    { '@type': 'DataDownload', encodingFormat: 'application/zip', contentUrl: `${SITE_URL}downloads/openjlpt-data.zip` },
    ...LEVEL_NAMES.flatMap((l) => [
      { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: `${cdnBase}/dataset/json/vocab/${l.toLowerCase()}.json` },
      { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${cdnBase}/dataset/csv/vocab-${l.toLowerCase()}.csv` },
    ]),
    { '@type': 'DataDownload', encodingFormat: 'application/vnd.sqlite3', contentUrl: `${SITE_URL}dataset/openjlpt.sqlite` },
  ],
})}</script>`,
  });

  writePage({
    path: '404.html',
    title: 'Page not found | Kotowa · 词和',
    description: 'Page not found.',
    noindex: true,
    body: `<h1>${ui("Page not found")}</h1><p class="lead">${ui("That page does not exist. Try the")} <a href="${new URL(SITE_URL).pathname}">${ui("search on the home page")}</a>.</p>`,
  });
}

// ---------------------------------------------------------------------------
// Data for the interactive tools

function writeData(): void {
  const dir = join(OUT, 'data');
  mkdirSync(dir, { recursive: true });
  const w = (name: string, data: unknown) => writeFileSync(join(dir, name), JSON.stringify(data));
  for (const level of LEVEL_NAMES) {
    const lc = level.toLowerCase();
    // Row layout: [progress key, front, …, page path]
    w(`vocab-${lc}.json`, vocab.get(level)!.map((v) => [v.id, v.word, v.reading, v.romaji, bilingual(v, v.meanings.slice(0, 4).join('; ')), v.examples?.[0]?.furigana ?? v.examples?.[0]?.ja ?? '', chineseExample(v, v.examples?.[0]?.ja ?? '') ?? v.examples?.[0]?.en ?? '', vocabPath(v)]));
    w(`kanji-${lc}.json`, kanji.get(level)!.map((k) => [k.character, k.character, k.onyomi.join('、'), k.kunyomi.join('、'), k.meanings.slice(0, 4).join(', '), (k.words ?? []).slice(0, 3).join('、'), kanjiPath(k.character)]));
    w(`grammar-${lc}.json`, grammar.get(level)!.map((g) => [g.id, g.pattern, g.romaji, bilingual(g, g.meaning), g.examples[0]?.ja ?? '', chineseExample(g, g.examples[0]?.ja ?? '') ?? g.examples[0]?.en ?? '', grammarPath(g)]));
  }
  // Search index: [kind, page path, text, reading, romaji, gloss, level, extra forms/tags]
  const search = [
    ...allVocab.map((v) => ['v', vocabPath(v), v.word, v.reading, v.romaji, truncate(v.meanings.slice(0, 3).join('; '), 80), v.level, (v.other_forms ?? []).join(' '), usableChinese(v)?.meanings.join('；') ?? '', usableChinese(v)?.status ?? '']),
    ...allKanji.map((k) => ['k', kanjiPath(k.character), k.character, [...k.onyomi, ...k.kunyomi].join(' '), '', truncate(k.meanings.slice(0, 3).join(', '), 80), k.level, '']),
    ...allGrammar.map((g) => ['g', grammarPath(g), g.pattern, g.reading ?? '', g.romaji, truncate(g.meaning, 80), g.level, g.tags.join(' '), usableChinese(g)?.meanings.join('；') ?? '', usableChinese(g)?.status ?? '']),
  ];
  w('search.json', search);
  w('kanji-levels.json', Object.fromEntries(allKanji.map((k) => [k.character, k.level])));
}

function writeSeo(): void {
  // Every page is generated from the data, so the data date is when its content last changed.
  const updated = meta.sources?.jmdict?.created;
  writeFileSync(
    join(OUT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
      .map((u) => `<url><loc>${esc(u.replace(/index\.html$/, ''))}</loc>${updated ? `<lastmod>${updated}</lastmod>` : ''}</url>`)
      .join('\n')}\n</urlset>\n`,
  );
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
  writeFileSync(join(OUT, '.nojekyll'), '');
}

// ---------------------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(join(ROOT, 'site', 'assets'), join(OUT, 'assets'), { recursive: true });
writeFileSync(join(OUT, 'assets/i18n.js'), I18N_SCRIPT);
cpSync(DATA_DIR, join(OUT, 'dataset'), { recursive: true });
cpSync(join(ROOT, 'assets', 'kotowa-social.png'), join(OUT, 'assets', 'kotowa-social.png'));
homePage();
levelPages();
vocabPages();
kanjiPages();
grammarPages();
toolPages();
const legacyOrigins = (process.env.LEARNING_LEGACY_ORIGINS ?? '').split(',').filter(Boolean).map(value => {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LEARNING_LEGACY_ORIGINS must contain HTTP(S) origins only');
  }
  return url.origin;
});
for (const page of learningPages([...new Set(legacyOrigins)])) writePage(page);
mkdirSync(join(OUT, 'legacy-migration'), { recursive: true });
writeFileSync(join(OUT, 'legacy-migration/index.html'), legacyMigrationPage(SITE_URL));
writeData();
for (const [module, entries] of Object.entries(learningData)) {
  writeFileSync(join(OUT, 'data', `learn-${module}.json`), JSON.stringify(entries));
}
writeSeo();
console.log(`Site: ${pages.length} pages -> ${OUT}`);
