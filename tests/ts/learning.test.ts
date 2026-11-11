import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildLearningData, conjugate, LEARNING_MODULES, readLearningSources, readLearningChinese, chinesePayload, learningHash, wordCategory } from '../../scripts/lib/learning.ts';

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const vocab = ['n5','n4','n3','n2','n1'].flatMap(level => read(`data/json/vocab/${level}.json`));
const grammar = ['n5','n4','n3','n2','n1'].flatMap(level => read(`data/json/grammar/${level}.json`));
const data = buildLearningData(vocab, grammar, new Map(vocab.map(v => [v.id, `vocab/${v.id}.html`])));
const coreContext: Record<string, any> = {};
runInNewContext(readFileSync('site/assets/learning-core.js', 'utf8'), coreContext);
const core = coreContext.KotowaLearning;

test('all curricula preserve unique IDs, reviewed supplemental content and canonical precedence', () => {
  const chinese = readLearningChinese();
  assert.deepEqual(Object.values(data).map((rows: any) => rows.length), [104, 206, 102]);
  for (const module of LEARNING_MODULES) {
    const sources = readLearningSources(module);
    assert.equal(new Set(sources.map(s=>s.id)).size, sources.length);
    for (const source of sources) {
      const zh = chinese[source.id];
      assert.equal(zh.source_hash, learningHash(source));
      assert.equal(zh.review_hash, learningHash({source, content:chinesePayload(zh)}));
      assert.equal(zh.review_method, 'ai');
      const row: any = data[module].find((r: any) => r.id === source.id);
      const canonical = source.vocab_id ? vocab.find(v=>v.id===source.vocab_id) : grammar.find(g=>g.id===source.grammar_ids?.[0]);
      if (canonical) {
        assert.equal(row.level, canonical.level);
        assert.equal(row.meanings.zh, canonical.zh.meanings.join('；'));
        assert.deepEqual(row.examples.map((e: any)=>e.ja), (canonical.examples ?? []).map((e: any)=>e.ja));
      } else assert.equal(row.level, null);
      assert.ok(!('reviewer' in row));
      assert.ok(!('source_hash' in row));
    }
  }
  const verbs: any[] = data.verbs;
  for (const word of ['届ける','積み重ねる']) assert.equal(verbs.find(v=>v.word===word).group, 'g2');
  for (const word of ['沈む','浮かぶ','起こす','申し込む']) assert.equal(verbs.find(v=>v.word===word).group, 'g1');
  assert.equal(verbs.filter(v=>v.word==='払う').length, 1);
  const words: any[] = data['word-classes'];
  assert.equal(words.find(v=>v.word==='僕').level, 'N4');
  assert.equal(words.find(v=>v.word==='俺').level, 'N1');
  assert.equal(words.find(v=>v.word==='何').reading, 'なに');
  for (const word of ['〜本','〜人','ある（連体）']) assert.equal(words.find(v=>v.word===word).vocab, null);
  assert.equal(words.find(v=>v.word==='で').grammar[0].id, 'de-place');
  assert.equal(words.find(v=>v.word==='ね').grammar[0].id, 'ne');
  assert.equal(wordCategory(['adv'], 'conj'), 'adv');
  assert.equal(words.find(v=>v.word==='もし').category, 'adv');
  assert.equal(words.find(v=>v.word==='ごめんなさい').category, 'exp');
  for (const row of data.kana) assert.equal(row.id, row.hira);
});

test('conjugation handles ichidan, godan, suru and kuru with lexical exceptions', () => {
  assert.deepEqual(conjugate('書く','かく','g1'), {neg:'書かない',masu:'書きます',te:'書いて',ta:'書いた',poss:'書ける',voli:'書こう',imp:'書け',cond:'書けば'});
  assert.equal(conjugate('行く','いく','g1').te, '行って');
  assert.equal(conjugate('泳ぐ','およぐ','g1').ta, '泳いだ');
  assert.equal(conjugate('買う','かう','g1').neg, '買わない');
  assert.equal(conjugate('沈む','しずむ','g1').poss, '沈める');
  assert.equal(conjugate('届ける','とどける','g2').neg, '届けない');
  assert.equal(conjugate('積み重ねる','つみかさねる','g2').poss, '積み重ねられる');
  assert.equal(conjugate('申し込む','もうしこむ','g1').te, '申し込んで');
  assert.equal(conjugate('勉強する','べんきょうする','g3').poss, '勉強できる');
  assert.equal(conjugate('来る','くる','g3').cond, '来れば');
  assert.equal(conjugate('くる','くる','g3').neg, 'こない');
  assert.equal(conjugate('ある','ある','g1').neg, 'ない');
  assert.throws(()=>conjugate('食べる','たべる','g3'), /Unsupported irregular/);
});

test('quiz questions have distinct choices, exactly one answer, and respect small pools', () => {
  let seed = 12;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const module of ['verbs','word-classes']) for (const kind of ['meanings','category','usage', ...(module==='verbs'?['forms']:[])]) {
    for (let round = 0; round < 40; round++) {
      const questions = core.questions(data[module],kind,'all',random);
      assert.ok(questions.length > 0 && questions.length <= 10);
      assert.equal(new Set(questions.map((q: any)=>q.id)).size, questions.length);
      for (const q of questions) {
        assert.equal(q.choices.filter((x: string)=>x===q.answer).length, 1);
        assert.equal(new Set(q.choices).size, q.choices.length);
        assert.ok(q.choices.length >= 2 && q.choices.length <= 4);
      }
    }
  }
  assert.equal(core.questions([], 'meanings').length, 0);
  assert.equal(core.questions(data.verbs.slice(0,1),'category').length, 0);
  assert.equal(core.questions(data.verbs.slice(0,1),'forms','te').length, 1);
});

test('progress validation and repeated imports merge known IDs without inflating scores', () => {
  const ids = ['あ','い','う'];
  const a = {learned:['あ','invalid','あ'],quiz:{rounds:1,answered:10,correct:8}};
  const b = {learned:['い','あ'],quiz:{rounds:1,answered:10,correct:10}};
  const merged = core.merge(a,b,ids);
  assert.equal(JSON.stringify(merged.learned), JSON.stringify(['あ','い']));
  assert.equal(merged.quiz.correct, 8);
  assert.equal(JSON.stringify(core.merge(merged,b,ids)), JSON.stringify(merged));
  assert.equal(core.normalize({quiz:{answered:2,correct:10}},ids).quiz.correct, 2);
  for (const value of [null, {}, {version:2,format:'kotowa-learning'}, {version:1,format:'kotowa-legacy-kana',learned:[{}]}]) assert.throws(()=>core.importRecords(value));
  assert.equal(JSON.stringify(core.importRecords(['あ'])), JSON.stringify({kana:{learned:['あ']}}));
  assert.ok(core.importRecords({version:1,format:'kotowa-learning',modules:{verbs:a}}).verbs);
});
