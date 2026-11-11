import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { messages, ui, uiAttr } from '../../scripts/lib/site-i18n.ts';
import { ROOT } from '../../scripts/lib/util.ts';

test('UI translations preserve interpolation parameters and fail on missing static messages', () => {
  const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const [english, chinese] of Object.entries(messages)) {
    assert.ok(chinese.trim(), english);
    assert.deepEqual(tokens(chinese), tokens(english), english);
  }
  assert.throws(() => ui('Missing translation'), /Missing Chinese UI translation/);
  assert.throws(() => uiAttr('title', 'Missing translation'), /Missing Chinese UI translation/);
  const marked = ui('{count} words', { count: '<script>&"' });
  assert.ok(!marked.includes('<script>'));
  assert.ok(marked.includes('&lt;script&gt;&amp;&quot;'));
});

test('UI runtime selects supported languages and escapes dynamic markup', () => {
  const source = readFileSync(join(ROOT, 'site/assets/i18n.js'), 'utf8')
    .replace('/* LOCALE_MESSAGES */ {}', JSON.stringify(messages));
  for (const [browser, saved, expected] of [
    ['zh-CN', null, 'zh-CN'], ['zh-TW', 'invalid', 'zh-CN'],
    ['en-US', null, 'en'], ['fr-FR', null, 'en'], ['zh-CN', 'en', 'en'],
    ['en-US', 'zh-CN', 'zh-CN'],
  ]) {
    const document = { documentElement: { lang: '' }, addEventListener() {} };
    const window: Record<string, any> = { addEventListener() {} };
    runInNewContext(source, { document, window, navigator: { language: browser }, localStorage: { getItem: () => saved } });
    assert.equal(document.documentElement.lang, expected);
    assert.equal(window.KotowaI18n.t('Unknown message'), 'Unknown message');
    assert.equal(window.KotowaI18n.t('{count} words', { count: 2 }), expected === 'en' ? '2 words' : '2 个词汇');
    assert.ok(!window.KotowaI18n.html('Remove {word} from focused review', { word: '"><img src=x>' }).includes('<img'));
  }
});
