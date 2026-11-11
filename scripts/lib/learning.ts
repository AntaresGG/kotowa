/** Supplemental curricula. Canonical dictionary/grammar fields always win. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './util.ts';

export const LEARNING_MODULES = ['kana', 'verbs', 'word-classes'] as const;
export type LearningModule = typeof LEARNING_MODULES[number];
export type VerbGroup = 'g1' | 'g2' | 'g3';
export const FORM_LABELS = {
  neg: 'Negative', masu: 'Polite', te: 'Te form', ta: 'Past',
  poss: 'Potential', voli: 'Volitional', imp: 'Imperative', cond: 'Conditional',
};
export const CATEGORY_LABELS: Record<string, string> = {
  pro: 'Pronouns', num: 'Numbers and counters', rent: 'Prenominal adjectives',
  adv: 'Adverbs', conj: 'Conjunctions', intj: 'Interjections',
  aux: 'Auxiliary expressions', part: 'Particles', exp: 'Expressions',
};
export interface LearningSource {
  id: string;
  word: string;
  reading: string;
  romaji: string;
  category: string;
  group?: VerbGroup;
  vocab_id?: string;
  grammar_ids?: string[];
  derived_suru?: boolean;
  usage?: string[];
  examples?: string[];
  hira?: string;
  kata?: string;
  row?: string;
}
export interface LearningChinese {
  meaning: string;
  explanation?: string;
  notes?: string;
  usage?: { label: string; ja: string; meaning: string }[];
  examples?: string[];
  status: 'draft' | 'reviewed';
  source_hash: string;
  review_hash?: string;
  reviewer?: string;
  review_method?: string;
  reviewed_at?: string;
}
interface Canonical {
  id: string; word?: string; pattern?: string; reading?: string; romaji: string;
  level: string; pos?: string[]; meanings?: string[]; meaning?: string;
  examples?: { ja: string; furigana?: string; en: string }[];
  zh?: { status: string; meanings: string[]; formation?: string; explanation?: string; notes?: string;
    examples?: { ja: string; zh: string }[] };
}
export const learningHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function chinesePayload(value: LearningChinese) {
  return { meaning: value.meaning, explanation: value.explanation ?? '', notes: value.notes ?? '',
    usage: value.usage ?? [], examples: value.examples ?? [] };
}
export function readLearningSources(module: LearningModule): LearningSource[] {
  return JSON.parse(readFileSync(join(ROOT, 'sources/learning', module + '.json'), 'utf8')).entries;
}
export function readLearningChinese(): Record<string, LearningChinese> {
  return JSON.parse(readFileSync(join(ROOT, 'sources/zh-CN/learning.json'), 'utf8')).entries;
}
export function verbGroup(pos: string[]): VerbGroup | undefined {
  if (pos.some(p => /^vs|^vk/.test(p))) return 'g3';
  if (pos.some(p => /^v1/.test(p))) return 'g2';
  if (pos.some(p => /^v5/.test(p))) return 'g1';
  return undefined;
}
export function wordCategory(pos: string[], preferred: string): string {
  const matches: Record<string, boolean> = {
    pro: pos.includes('pn'), num: pos.some(p => ['num', 'ctr'].includes(p)),
    rent: pos.includes('adj-pn'), adv: pos.some(p => /^adv/.test(p)),
    conj: pos.includes('conj'), intj: pos.includes('int'), exp: pos.includes('exp'),
    part: pos.includes('prt'), aux: pos.some(p => /^aux/.test(p)),
  };
  return matches[preferred] ? preferred : Object.keys(matches).find(k => matches[k]) ?? 'exp';
}

/** Dictionary forms, including lexical exceptions; do not infer verb group from る. */
export function conjugate(word: string, reading: string, group: VerbGroup): Record<keyof typeof FORM_LABELS, string> {
  const make = (neg: string, masu: string, te: string, ta: string, poss: string, voli: string, imp: string, cond: string) =>
    ({ neg, masu, te, ta, poss, voli, imp, cond });
  if (group === 'g3') {
    if (word.endsWith('する')) {
      const stem = word.slice(0, -2);
      return make(stem + 'しない', stem + 'します', stem + 'して', stem + 'した', stem + 'できる', stem + 'しよう', stem + 'しろ', stem + 'すれば');
    }
    if (reading === 'くる') return word === 'くる'
      ? make('こない', 'きます', 'きて', 'きた', 'こられる', 'こよう', 'こい', 'くれば')
      : make('来ない', '来ます', '来て', '来た', '来られる', '来よう', '来い', '来れば');
    throw new Error(`Unsupported irregular verb: ${word}`);
  }
  const stem = word.slice(0, -1);
  if (group === 'g2') return make(stem + 'ない', stem + 'ます', stem + 'て', stem + 'た', stem + 'られる', stem + 'よう', stem + 'ろ', stem + 'れば');
  const endings: Record<string, string[]> = {
    う: ['わ','い','え','お','って','った'], く: ['か','き','け','こ','いて','いた'],
    ぐ: ['が','ぎ','げ','ご','いで','いだ'], す: ['さ','し','せ','そ','して','した'],
    つ: ['た','ち','て','と','って','った'], ぬ: ['な','に','ね','の','んで','んだ'],
    ぶ: ['ば','び','べ','ぼ','んで','んだ'], む: ['ま','み','め','も','んで','んだ'],
    る: ['ら','り','れ','ろ','って','った'],
  };
  const e = endings[word.at(-1)!];
  if (!e) throw new Error(`Unsupported godan verb: ${word}`);
  const iku = reading === 'いく' || reading === 'ゆく';
  return make(reading === 'ある' ? 'ない' : stem + e[0] + 'ない', stem + e[1] + 'ます',
    stem + (iku ? 'って' : e[4]), stem + (iku ? 'った' : e[5]), stem + e[2] + 'る',
    stem + e[3] + 'う', stem + e[2], stem + e[2] + 'ば');
}

export function buildLearningData(vocabulary: Canonical[], grammar: Canonical[], paths: Map<string, string>) {
  const byId = new Map(vocabulary.map(v => [v.id, v]));
  const grammarById = new Map(grammar.map(g => [g.id, g]));
  const chinese = readLearningChinese();
  return Object.fromEntries(LEARNING_MODULES.map(module => [module, readLearningSources(module).map(source => {
    const zh = chinese[source.id];
    if (!zh || zh.status !== 'reviewed' || zh.source_hash !== learningHash(source) ||
        zh.review_hash !== learningHash({ source, content: chinesePayload(zh) })) {
      throw new Error(`Supplemental content needs review: ${source.id}`);
    }
    const v = source.vocab_id ? byId.get(source.vocab_id) : undefined;
    if (source.vocab_id && !v) throw new Error(`Missing canonical vocabulary: ${source.vocab_id}`);
    const related = (source.grammar_ids ?? []).map(id => {
      const g = grammarById.get(id);
      if (!g) throw new Error(`Missing canonical grammar: ${id}`);
      return g;
    });
    const canonical = v ?? related[0];
    const canonicalZh = canonical?.zh?.status !== 'stale' ? canonical?.zh : undefined;
    const group = module === 'verbs' ? (v ? verbGroup(v.pos ?? []) : source.group) : undefined;
    if (module === 'verbs' && !group) throw new Error(`Missing verb group: ${source.id}`);
    const category = module === 'word-classes' && v ? wordCategory(v.pos ?? [], source.category) : source.category;
    // A suru compound keeps its full teaching form while linking the canonical noun.
    const reading = v && !source.derived_suru ? v.reading ?? source.reading : source.reading;
    const examples = canonical?.examples?.length ? canonical.examples.map(e => ({
      ja: e.ja, furigana: e.furigana ?? '', en: e.en,
      zh: canonicalZh?.examples?.find(z => z.ja === e.ja)?.zh ?? '',
    })) : (source.examples ?? []).map((ja, i) => ({ ja, en: '', zh: zh.examples?.[i] ?? '', furigana: '' }));
    return {
      id: source.id, word: source.word, reading, romaji: v && !source.derived_suru ? v.romaji : source.romaji,
      category, group, level: canonical?.level ?? null,
      meanings: { en: (canonical?.meanings ?? [canonical?.meaning ?? '']).join('; '),
        zh: canonicalZh?.meanings.join('；') ?? zh.meaning },
      explanation: canonicalZh?.explanation ?? zh.explanation ?? '',
      notes: canonicalZh?.notes ?? zh.notes ?? '',
      formation: canonicalZh?.formation ?? '',
      usage: zh.usage ?? [], examples,
      forms: group ? conjugate(source.word, reading, group) : undefined,
      vocab: v ? { id: v.id, level: v.level, path: paths.get(v.id) } : null,
      grammar: related.map(g => ({ id: g.id, word: g.pattern, path: `grammar/${g.id}.html` })),
      hira: source.hira, kata: source.kata, row: source.row,
    };
  })]));
}
