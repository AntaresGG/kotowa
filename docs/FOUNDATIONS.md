# Foundation lessons

The static builder provides `/learn/`, `/learn/kana/`, `/learn/verbs/` and
`/learn/word-classes/`. These use Kotowa's shared navigation, appearance controls,
interface languages, Japanese speech and dictionary links.

## Content

Japanese curriculum units and explicit dictionary/grammar associations live in
`sources/learning/`. Supplemental Chinese belongs in `sources/zh-CN/learning.json`.
The builder checks source and review hashes before including it. Record a new
review after editing content; do not refresh hashes merely to bypass the check.
The integration inventory, original page hashes and decisions are in
`sources/quality/learning-integration-review.json`.

Canonical Kotowa meanings, examples, levels and parts of speech take precedence.
An identical spelling with a different sense or reading is not automatically a
match. Suru compounds may link the canonical suru noun. Unmatched units remain
supplemental lessons without an asserted JLPT level. Existing vocabulary, grammar,
flashcard and Anki IDs are unchanged.

Verb forms are generated from the canonical verb group, with the 行く, ある,
する and 来る exceptions. Potential forms are the standard full forms. Lesson
scores describe practice, not a certification of language proficiency.

## Browser records

The versioned keys `kotowa:learn:<module>:v1` keep studied IDs and completed quiz
round totals. Marking a lesson studied and answering a quiz do not modify flashcard
mastery or review dates. Saving a linked vocabulary item uses the existing focused
review collection. The kana IDs retain the old page's hiragana identifiers.

All modules support JSON export/import. Imports merge known studied IDs, ignore
unknown IDs and avoid adding duplicate quiz totals. Storage failures are reported;
the in-memory session remains usable and can be exported.

## Legacy origins and redirects

Set `LEARNING_LEGACY_ORIGINS` to a comma-separated list of old HTTPS origins when
building the public release. Leave it unset for deployments without old-origin
records. `SITE_URL` determines the bridge's permitted destination origin.

Deploy the new release first. Then run `scripts/configure-learning-redirects.py`
on the Nginx host with its explicit site URL, release root, legacy root, site
configuration, snippet path and backup directory. It backs up the configuration,
checks Nginx and reloads it. It does not remove the old HTML files. The redirects
map `/a[/...]` to word classes, `/b[/...]` to kana and `/c[/...]` to verbs.

The old origin must serve the generated `legacy-migration/index.html` at
`/_kotowa-migration/`. The script scopes its framing policy to the new origin,
overriding an inherited SAMEORIGIN header for this endpoint only. Other pages keep
their existing framing restrictions. The bridge reads only `gojuon_learned`; it
does not clear or change old records or send unrelated browser data.

On a first visit to kana, an invisible old-origin frame transfers those IDs using
messages checked against both origin and source window. The destination merges
them and records completion only after storage succeeds. No progress is placed in
URLs. Repeated transfers are safe. Deliberately resetting the new lesson does not
trigger another automatic import. Users can retry or export from the old-origin
bridge and import manually if browser settings block automatic transfer. Users
must visit using the browser/profile containing their old records.

The original word-class and verb pages had no persistent learning records.

## Validation

`tests/ts/learning.test.ts` checks canonical precedence, review hashes, verb forms,
quiz options and import behavior. `tests/test_learning.py` checks actual browser
interactions, the three themes, Chinese/English controls, storage fallback and the
cross-origin bridge in isolated browser contexts. Run the existing flashcard and
Silver Era checks when changing shared layout or progress presentation.
