# Kotowa project conventions

- Preserve upstream English fields and stable IDs. New Chinese content belongs in sources/zh-CN; do not hand-edit generated data.
- Apply guarded entry corrections through sources/corrections/entries.json and npm run prepare:data. If upstream content conflicts, investigate rather than rewriting the guard.
- Chinese source hashes cover original content. Never refresh a hash solely to silence stale detection. User authorization on 2026-10-28 permits Codex to review and approve Chinese content. Record reviewer=Codex, review_method=ai, reviewed_at and review_hash only after actual review. Do not imply independent human review. New unreviewed text remains draft; edits to reviewed content require re-review.
- Keep the Chinese pilot, reference evidence and quality report honest about sampling and review coverage.
- Run npm run check:data, npm run validate, npm run typecheck, npm test and Python tests for affected data/API changes. Run a static-site build and export checks for rendering changes.
- The website is statically generated. Avoid introducing a backend for localization or search.
- Keep review status and provenance in data and maintenance records. Do not display pilot notices, draft/review badges or AI-review labels in learner-facing pages, search, flashcards or Anki exports (owner preference, 2026-10-28).
- Keep deployment hosts and credentials out of committed documentation. Production SITE_URL is deployment configuration.

## Repository governance

- This standalone repository is the product source of truth. origin is AntaresGG/kotowa; fork is AntaresGG/OpenJLPT; upstream is evanclan/OpenJLPT.
- Preserve the inherited history and migration-baseline-2026-10-28. Never rewrite or force-push product main.
- Owner preference (2026-10-28): use main directly for product work, both locally and on origin. Run relevant checks, commit on local main and push to origin/main; do not create feature branches or require product PRs unless explicitly requested. Keep fork/main tracking upstream/main by fast-forward only.
- Create contrib/* branches from a freshly fetched upstream/main, with isolated patches and tests. Track source SHAs and dependencies in UPSTREAM_CONTRIBUTIONS.md.
- Evaluate upstream changes before applying them to product main; neither code nor data refreshes are automatically merged. Separate contrib/* branches remain specific to the upstream contribution fork, not ordinary product work.
- PC commit/push precedes Mac pull/deploy. Preserve browser storage keys, entry IDs and Anki IDs during branding and version changes.
- Owner preference (2026-11-01): after every committed change in this repository, immediately push and deploy the same revision to Mac mini, including documentation-only changes. Follow docs/DEPLOY-MACOS.md and verify the live revision and affected behavior before reporting completion. This deployment is authorized without asking again; report any actual blocker.
- Product branding is Kotowa · 词和; repository and distribution name is kotowa. Preserve the openjlpt Python import/CLI alias, legacy export filenames, Yomitan dictionary title and deployment service identifiers for compatibility. Keep upstream OpenJLPT attribution.
- GitHub Releases are the distribution channel. npm/PyPI/Hugging Face publication and public Pages hosting require separate explicit configuration.
