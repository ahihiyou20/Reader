# 09 — Daily writer (Claude routine)

A scheduled Claude routine runs this once a day. It finds sources, writes about 20 original Reader
articles (group 4, see docs/05 §2) on varied topics, checks them, and pushes them to `main`, which
publishes them through `deploy.yml`. The Gemini feed bot (`feeds.yml`) runs separately and opens its
own pull request; this routine does not touch it.

## 1. Pick topics

- Write **20 articles**. Fewer is fine when quality would suffer; never pad.
- Spread them over all 8 categories in `content/categories.json` (psychology, science, economics,
  society, health, productivity, history, technology): at least 2 per category, no more than 4.
- Avoid topics already covered: compare titles, slugs and tags against `content/articles/*.json`.
- Mix kinds: a recent finding, an explainer of how something works, a piece of history, a practical
  topic backed by research, a data story.

## 2. Find sources

- Each article rests on **2–4 real sources you have opened and read**: peer-reviewed papers (with
  DOI), government agencies (NIH, CDC, NASA, NOAA, USGS, NIST), Our World in Data, Wikipedia for
  history, reputable science journalism. Never cite a page you have not read.
- Every number, name, date and quote must come from a source; a fact you cannot source is cut.
- Some sites block the cloud session (seen 2026-11-04: PubMed, CDC, FDA, BLS, Britannica). Reach
  papers through the Europe PMC API (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=…&resultType=core&format=json`,
  which returns abstracts and DOIs), and use WHO, NHS, NOAA, NASA, NIST, USGS, Our World in Data,
  nobelprize.org, national statistics offices and Wikipedia. Pick topics whose sources you can open.
- Research enough per topic to fill 700 words with sourced facts; if a topic is thin, choose
  another topic instead of publishing a short article.
- Keep going until 20 articles pass validation or about 90 minutes have passed; work in batches
  (research 5 topics, write 5, validate) so a slow source does not stall the whole run.
- Write in your own words. Do not copy sentences; quotations stay under 8 words.

## 3. Write

Before writing, load the skills `avoid-ai-writing` and `creative-writing-skills:llm-writing` and
follow them. If a skill is not installed in the session, follow `WRITING_RULES` below on its own. The rules they boil down to are in `WRITING_RULES` in `scripts/pipeline/gemini.ts`; the
Gemini bot uses the same text, so both writers sound like one publication.

Shape (match `content/articles/how-habits-form.json`, a group 4 article):

- `title`: at most 12 words. `hook`: 40–80 words that lead with the most interesting fact.
- `sections`: 5–7 sections with short headings, each at most 130 words; 700–950 English words in total
  (hook included), the limits `lib/content/validate.ts` checks.
- Markup: `**bold**` once per article at most, `[y:…]` facts and numbers, `[p:…]` the main idea,
  `[g:…]` a practical tip, at most 2 highlights per section; `{ref-id}` chips right after the claim
  they support, one id per entry in `references` (`{ id, label, url }`).
- `keyPoint`: 40–60 words, the idea a reader should keep. `applySteps`: exactly 3 short, concrete
  steps a reader can do this week (for non-practical topics, steps to explore or observe).
- `tags`: 3–5 lowercase tags. `category`: one id from `content/categories.json`.
- Vietnamese: every field also gets `_vi` / `vi`, written as natural Vietnamese for educated adults
  (not word for word), with the English term in italics in brackets after a technical term's first
  use, e.g. thiên kiến xác nhận (*confirmation bias*). The Vietnamese text keeps the same highlights
  and reference chips.
- `status: "published"`, `publishAt`: today at 00:00 UTC, `origin`: `{ group: 4, license:
  "Reader-CC-BY-4.0", authors: ["Claude for Reader"], changes: [] }`. No `ai` block: that field
  tracks Gemini suggestions waiting for an editor, and an unreviewed one blocks publishing.
- `slug`: lowercase words joined by hyphens, at most 60 characters, unique.

Revise each article once against the skills before saving: read it as a first-time reader, cut
filler, check every claim against its source.

## 4. Covers

For each article pick a fitting photo from picsum.photos (browse `https://picsum.photos/v2/list?page=N&limit=100`
and choose by subject), then run `pnpm tsx scripts/dev/picsum-cover.ts <slug> <picsum-id>`. It
stores `public/covers/<slug>.webp` and writes the cover credit into the article. Do not reuse an id
used by another article.

## 5. Check and publish

1. `pnpm validate` must report no errors for the new files; fix and re-run.
2. `pnpm content` must succeed.
3. Commit only `content/articles/*.json` and `public/covers/*.webp` for the new articles, as
   `reader-writer <noreply@anthropic.com>`, message `content: daily written articles YYYY-MM-DD`.
4. `git pull --rebase origin main`, then `git push origin HEAD:main`. The deploy workflow builds and
   publishes the site.

If validation keeps failing for an article, drop that article rather than publishing it broken.
