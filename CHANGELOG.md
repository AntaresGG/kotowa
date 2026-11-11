# Changelog

## Unreleased

- Integrate kana, verb conjugation and word-class lessons into Foundations with shared themes, bilingual controls, dictionary/grammar links and focused review. Reconcile legacy content against canonical Kotowa data; keep lesson progress and quiz totals separate from flashcard scheduling. Add repeatable cross-origin kana progress transfer, JSON backups and guarded Nginx redirects for the original three pages.

- Fit the Silver Era desktop flashcard console to the viewport: align the wooden frame with the bottom edge, scale the receiver with available height, and give remaining space to the full-size study card. Keep the study toolbar and progress beside the card.

- Separate flashcard browsing from self-ratings: Previous (←), Show (↑), Next (→) and Knew it (↓). Keep the full session available for browsing, restore its position after reload, and rate each card only once per session.

- Add Chinese/English interface switching across navigation, search, flashcards, text analysis, downloads and appearance controls. Follow the browser language initially, remember explicit choices and sync tabs without changing study progress or learning content.

- Add a browser-local focused-review collection: toggle saved cards from either flashcard face, browse and remove cards by level/deck, and practice them anytime with resumable sessions independent of the daily spaced-repetition schedule.

- Rename the product and repository to Kotowa · 词和 (`AntaresGG/kotowa`), with updated website branding, metadata and documentation. Distribution names become `kotowa`; add the `kotowa` CLI while retaining the `openjlpt` alias and Python import. Browser storage keys, Anki IDs, dictionary identity and legacy export filenames remain compatible.
- Complete N5/N4 Chinese vocabulary and grammar with GPT-6.1 Terra authoring and AI review: 1,104 additional words and 149 additional grammar points, including translations of their examples. N5–N1 now cover all 7,811 words and 526 grammar points; kanji Chinese meanings remain outside this change.
- Add guarded beginner example, reading and meaning corrections while preserving entry IDs and source attribution. Record review provenance and dictionary evidence without implying independent human review.
- Align the README language set with upstream English/Japanese, retain Simplified Chinese, and document full dataset totals separately from Chinese coverage.

## 0.4.0 — 2026-10-28 (first independent release)

- Established OpenJLPT-ZH-premium as the product repository; the original fork remains the upstream contribution channel. Full Git ancestry and original attribution are retained.
- Complete reviewed Chinese vocabulary and grammar for N3, N2 and N1: 6,507 words and 347 grammar points. Including the N5/N4 pilot: 6,707 words, 377 grammar points, 14,093 translated examples.
- Preserve flashcard sessions across deck switches and reloads; add persistent shuffle mode.
- Guard source corrections and Chinese review hashes; preserve stable entry and Anki IDs.
- Add reproducible Mac LAN deployment, release artifacts and selective upstream synchronization governance.
- Distribution names are now openjlpt-zh-premium; Python imports and the openjlpt CLI remain compatible. No npm/PyPI publication is implied by this GitHub release.


All notable changes to OpenJLPT are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/). Data changes that alter field names or meanings
count as breaking.

## [0.3.0] — 2026-09-29

A big data-quality release: every word is verified against JMdict, grammar grows from 100 to
526 points, and there are new learner downloads and a website.

### Added
- **Vocabulary fields:** stable `id`, `romaji`, JMdict `pos` and `jmdict_id`, `other_forms`,
  `other_readings`, and `tatoeba_id` on example sentences.
- **Kanji fields:** `radical`, `radical_number`, `nanori`, and `words` (vocabulary that uses the kanji).
- **Grammar:** 526 original, reviewed points (was 100), each with a stable `id`, `romaji`,
  `formation`, 2–3 examples, controlled `tags` and notes on similar patterns.
- `data/json/meta.json` (counts, upstream versions) and `data/json/pos.json` (part-of-speech legend).
- SQLite: `pos` table and a `vocab_fts` FTS5 full-text index; tables now use the JSON IDs as keys.
- **npm package:** `findWords`, `getVocabById`, `getGrammarById`, `kanjiIn`, `meta`, `posLabels`,
  `sample`, `normalize`; ranked search across kanji, kana, romaji and English; an `openjlpt` CLI.
- **Python package:** the same API (`find_words`, `get_vocab_by_id`, `kanji_in`, …), a read-only
  SQLite connection, and an `openjlpt` CLI (`python -m openjlpt`).
- **Website** (GitHub Pages): pages for every word, kanji and grammar point, search,
  spaced-repetition flashcards, and a JLPT kanji-level text analyzer.
- **Anki decks** (per level and complete) and a **Yomitan** JLPT-level dictionary.
- `sources/waller/`: a verbatim snapshot of the upstream level lists, for reproducible builds.
- `sources/corrections/vocab.json`: reviewed fixes for individual source cards.
- **Furigana on example sentences** (`examples[].furigana`, in `{漢字|かんじ}` notation) for about
  four in five sentences (and all grammar examples), shown on the website, in flashcards and in the Anki decks; `toRubyHtml()` /
  `to_ruby_html()` render it as HTML ruby.
- 172 jōyō kanji missing from Waller's pre-2010 lists (誰, 頃, even 分), marked `supplementary`.
- `sources/ids.lock.json` freezes every word's ID, so fixes to a spelling or reading never change it.

### Fixed
- 1,096 kana-only words had an empty `reading`.
- 30 suru-nouns had する in their reading (勉強 read べんきょうする).
- Part-of-speech notes and mojibake stored as readings (はい → `（感）`, 賛成 → `Uӣ[い`).
- Glosses split inside parentheses, numbered senses, leading POS codes, and glosses cut off at
  100 characters in the source.
- Dozens of wrong readings and misspelled headwords, corrected against JMdict (途中 つちゅう →
  とちゅう, 灰皿 はいさら → はいざら, 著 → 着, 田ぼ → 田んぼ).
- Words listed at several levels now appear once, at the easiest level; other spellings are kept in `other_forms`.
- Example sentences are matched by dictionary form (via Tatoeba's word index) instead of
  substring, so there are no more false matches (あれ in 冷徹であれ, the kanji word 蚊 in the
  particle か). 93% of words have examples.
- Irregular and outdated spellings use the usual form (明い → 明るい, 此の → この, 攫う → さらう),
  keeping the old one in `other_forms`; archaic readings give way to the common one (魚 うお →
  さかな); cards whose English described a different word are fixed (人気 にんき "sign of life" →
  "popularity", 角 すみ "horn" → つの).
- Spreadsheet junk (`#NAME?`, `TODO`) removed from meanings; dictionary tags spelled out
  ((sl) → (slang)); particle は romanised *wa* (実は → jitsuwa).
- The monthly data refresh had failed on every run because its token couldn't push.
- `find_word` / `findKanji` no longer scan the whole dataset on every call.

### Changed
- Vocabulary is sorted by reading within each level; grammar keeps teaching order.
- Mis-levelled seed grammar points were moved (for example 〜がち and 〜だらけ from N1 to N3).
- Basic greetings (こんにちは, ありがとう, すみません…) and すぐ, which Waller's lists place above
  N5, are at N5.
- Python `examples`, `pos` and similar list fields default to `[]` instead of `None`.

## [0.2.0] — 2026-07-21

### Added
- 100 seed grammar points (20 per level) with JSON/CSV/SQLite output and loader support.

## [0.1.0] — 2026-07-01

### Added
- N5–N1 vocabulary and kanji as JSON, CSV and SQLite; Tatoeba example sentences; npm loader;
  Python package on PyPI.

[0.3.0]: https://github.com/evanclan/OpenJLPT/compare/c42fd9f...HEAD
[0.2.0]: https://github.com/evanclan/OpenJLPT/commit/c42fd9f
[0.1.0]: https://github.com/evanclan/OpenJLPT/commit/b1bd4c5
