# Kotowa · 词和

**English** · [日本語](README.ja.md) · [简体中文](README.zh-CN.md)

An independently maintained Japanese learning project based on [OpenJLPT](https://github.com/evanclan/OpenJLPT). AntaresGG adds Simplified Chinese learning content and study workflow improvements, preserving upstream history, attribution, stable IDs and the static-site architecture.

[![CI](https://github.com/AntaresGG/kotowa/actions/workflows/ci.yml/badge.svg)](https://github.com/AntaresGG/kotowa/actions/workflows/ci.yml)

## Dataset and Chinese coverage

Full dataset totals and Chinese coverage are different. Entries without Chinese content retain their English fields.

| Level | Words: Chinese / total | Grammar: Chinese / total | Chinese example translations |
| --- | ---: | ---: | ---: |
| N5 | 674 / 674 | 81 / 81 | 1,574 |
| N4 | 630 / 630 | 98 / 98 | 1,538 |
| N3 | 1,659 / 1,659 | 101 / 101 | 3,602 |
| N2 | 1,778 / 1,778 | 123 / 123 | 3,651 |
| N1 | 3,070 / 3,070 | 123 / 123 | 6,351 |
| **Total** | **7,811 / 7,811** | **526 / 526** | **16,716** |

Snapshot checked on 2026-10-28 against the repository [JSON data](data/json) and the [quality report](data/quality-report.json). The dataset also contains 2,383 kanji. All N5–N1 vocabulary and grammar are now covered in Chinese, including translations of every example. Chinese kanji meanings and a fully Chinese interface are outside this snapshot's completed scope.

- Chinese search, spaced-repetition flashcards, saved progress across deck switches and reloads, and persistent shuffle mode.
- Chinese/English interface switching in the header, including buttons, help text and live tool messages. The initial language follows your browser; explicit choices persist across pages and sync between tabs on the same origin. Learning content and study progress stay intact.
- JSON, CSV and SQLite exports; bilingual Anki decks preserving note IDs. Yomitan exports provide JLPT-level metadata, not definitions.
- Original English fields and stable IDs remain available through JavaScript/TypeScript and Python APIs.
- Chinese content was AI-authored and reviewed by Codex under owner authorization, not independently reviewed by a human. Review hashes and provenance remain in maintenance data. Stale Chinese content falls back to English in learning views and exports.

See the [Chinese maintenance notes](README.zh-CN.md) for review records and known limitations. JLPT levels are community estimates, not official exam lists.

## Download and install

Download data, Anki decks, Yomitan dictionaries and JavaScript/Python packages from [GitHub Releases](https://github.com/AntaresGG/kotowa/releases). The independent version is **v0.4.0**; inherited v0.1.0 and v0.2.0 tags belong to upstream history.

This project has not been published to npm or PyPI. The registry package `openjlpt` is the upstream product. Use this repository's release packages or install from source:

```sh
git clone https://github.com/AntaresGG/kotowa.git
cd kotowa
npm ci
npm run build:pkg
```

### JavaScript / TypeScript

Install the current source in your consuming project, then import:

```sh
npm install git+https://github.com/AntaresGG/kotowa.git#main
```

```ts
import { searchVocab, getGrammar } from 'kotowa';

const words = searchVocab('肥皂');
const grammar = getGrammar('N3');
```

The main entry uses Node.js file access. Browser applications should bundle the JSON files from `data/json/` or serve them as static assets.

### Python

From the repository root, install into a separate environment to avoid mixing with upstream's identically named import package:

```sh
uv venv
uv pip install --python .venv/bin/python .
# Windows: uv pip install --python .venv/Scripts/python.exe .
```

```python
from openjlpt import search_vocab, get_grammar

words = search_vocab("肥皂")
grammar = get_grammar("N3")
```

The distribution is named `kotowa`; the CLI is `kotowa`, with `openjlpt` retained as an alias. The Python import remains `openjlpt`. Existing v0.4.0 release packages retain their original names; use the `main` source for the Kotowa package name.

## Validation and deployment

Run from the repository root:

```sh
npm run check:data
npm run validate
npm run typecheck
npm test
npm run build:pkg
uv run --no-project --with pytest --with genanki python -m pytest -q
npm run audit:data
```

`npm run prepare:data` applies guarded corrections and merges Chinese content offline using committed sources. A full `npm run build` downloads upstream sources and requires tar/bzip2; review upstream changes before integration.

The website is static and requires no database service. Set `SITE_URL` to the actual deployment base URL, then build pages and downloads:

```sh
npm run build:site -- _site
uv run --no-project --with genanki python scripts/build_exports.py _site/downloads
```

See [Mac mini deployment](docs/DEPLOY-MACOS.md). Commit and push from PC to GitHub, then pull and deploy the same revision on Mac. GitHub Pages is disabled by default; host addresses belong in local configuration.

## Repository governance

- Product: `AntaresGG/kotowa`; `origin/main` is the product source of truth.
- Contribution fork: `AntaresGG/OpenJLPT`; keep product-specific changes off its `main`.
- Upstream: `evanclan/OpenJLPT`; start isolated `contrib/*` branches from freshly fetched upstream `main`.
- Migration baseline: `migration-baseline-2026-10-28` at `f72221983fb4c970411ac9a753f6796473321164`.

Develop product changes directly on local `main`, run relevant checks, and push to `origin/main`. See [governance and releases](docs/GOVERNANCE.md), [upstream contribution tracking](UPSTREAM_CONTRIBUTIONS.md) and the [changelog](CHANGELOG.md).

## Attribution and license

Originally based on [OpenJLPT](https://github.com/evanclan/OpenJLPT) by Evan Clan and contributors. This project is independently maintained and adds Chinese learning content and study workflow improvements.

The [CC BY-SA 4.0 license](LICENSE), [NOTICE](NOTICE.md) and [citation information](CITATION.cff) are preserved. See NOTICE for the sources and licenses of JMdict, KANJIDIC2, Waller, Tatoeba and KanjiVG. Newly authored examples do not borrow Tatoeba attribution. The Kotowa name does not change these licenses or data origins.
