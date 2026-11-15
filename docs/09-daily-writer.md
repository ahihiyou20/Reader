# 09 — Daily writer (Claude routine)

A scheduled Claude routine runs this once a day. It finds topics and sources, writes **at least 20**
original, in-depth Reader articles (group 4, see docs/05 §2) in all five languages, checks them, and
pushes them to `main`, which publishes them through `deploy.yml`. There is no upper limit: keep going
while the quality holds and time remains. The Gemini bot (`feeds.yml`, docs/05 step 11) runs
separately and opens its own pull request; this routine does not touch it, but avoids its topics.

## 1. Pick topics

- Write **20 articles or more**. Never pad a thin topic to reach the count: pick another topic.
- Spread them over all 8 categories in `content/categories.json` (psychology, science, economics,
  society, health, productivity, history, technology): at least 2 per category, more for the
  categories with the fewest articles (count `category` in `content/articles/*.json`).
- Avoid topics Reader already has or is about to have: compare titles, slugs and tags against
  `content/articles/*.json` on `main` **and** on the Gemini bot's branch
  (`git fetch origin bot/new-articles && git ls-tree --name-only origin/bot/new-articles content/articles/`).
- Mix kinds: a recent finding, an explainer of how something works, a piece of history, a practical
  topic backed by research, a data story.
- Use the same bar as the feed bot (`scripts/pipeline/triage.ts`): pick a topic only if a curious
  general reader would still find it worth knowing in a year and the sources hold enough mechanism
  and evidence for 1,000+ words. Skip announcements, events, personnel news, awards, politics and
  elections, court cases, sports seasons, film or album plots, and biographies of people a general
  reader has no reason to know.
- Where to look for topics: the feeds in `content/feeds.json` (about 40 science, health, psychology,
  economics, technology, productivity and history sources), Our World in Data, Quanta, Knowable,
  Smithsonian, JSTOR Daily, Aeon, Psyche, Science News, MIT News, IEEE Spectrum, Liberty Street
  Economics, the IMF blog, WHO news, Wikipedia (featured and good articles, "On this day"), and
  Europe PMC reviews of the last two years.

## 2. Find sources

- **Read every source page through Firecrawl** (the `firecrawl` connector attached to the routine:
  its search and scrape tools return clean markdown and get past JavaScript and bot walls). Use
  WebFetch/WebSearch only when Firecrawl fails or its monthly credits run out, and say so in the
  commit message.
- Each article rests on **3–5 real sources you have opened and read**: peer-reviewed papers (with
  DOI), government agencies (NIH, CDC, NASA, NOAA, USGS, NIST), WHO, Our World in Data, national
  statistics offices, nobelprize.org, Wikipedia for background and history, reputable science
  journalism. Never cite a page you have not read.
- Every number, name, date and quote must come from a source; a fact you cannot source is cut.
- Some sites block the cloud session (seen 2026-11-04: PubMed, CDC, FDA, BLS, Britannica). Reach
  papers through the Europe PMC API (`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=…&resultType=core&format=json`,
  which returns abstracts and DOIs) and Wikipedia through its API
  (`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&titles=…`).
  Pick topics whose sources you can open.
- Research enough per topic to fill 1,100–1,400 words with sourced facts; if a topic is thin, choose
  another topic instead of publishing a short article.
- Work in batches (research 5 topics, write 5, validate) so a slow source does not stall the run.
- Write in your own words. Do not copy sentences; quotations stay under 8 words.

## 3. Write

Before writing, load the skills `avoid-ai-writing` and `creative-writing-skills:llm-writing` and
follow them. If a skill is not installed in the session, follow `WRITING_RULES` in
`scripts/pipeline/gemini.ts` on its own; the Gemini bot uses the same text, so both writers sound like
one publication.

Shape (match `content/articles/how-habits-form.json` for the fields):

- `title`: 4–10 words, at most 60 characters, sentence case, plain text. The cover sets the part after
  a colon (when it is at most 26 characters) or the last 1–3 words in the category's decorative face
  (`lib/title.ts`), so shape it as "Subject: short vivid payoff" or end it on a concrete, striking
  word or two. No question marks, no clickbait. The translated titles follow the same shape.
- `hook`: 50–90 words that open with the most surprising fact.
- `sections`: 6–8 sections, each with a heading of 2–7 words and a body of 130–220 words in 1–3
  paragraphs. Hook plus sections: **1,000–1,500 English words** (aim for 1,100–1,400). The journey:
  what it is, how it works step by step, how it was found out, the evidence and its limits, what it
  means for the reader or what is still unknown.
- Markup: in **every section 1–2 highlights** of 2–7 words: `[y:…]` a key fact or number, `[p:…]` the
  main idea, `[g:…]` a practical tip (never a whole sentence); `**bold**` on one phrase in the whole
  article at most; `{ref-id}` chips right after the claim they support, at least one per section,
  one id per entry in `references` (`{ id, label, url }`).
- `keyPoint`: 40–60 words, the idea a reader should keep. `applySteps`: exactly 3 short, concrete
  steps a reader can do this week (for non-practical topics, steps to explore or observe).
- `tags`: 3–5 lowercase tags. `category`: one id from `content/categories.json`.
- `status: "published"`, `publishAt`: today at 00:00 UTC, `origin`: `{ group: 4, license:
  "Reader-CC-BY-4.0", authors: ["Claude for Reader"], changes: [] }`. No `ai` block: that field
  tracks Gemini suggestions waiting for an editor, and an unreviewed one blocks publishing.
- `slug`: lowercase words joined by hyphens, at most 60 characters, unique.

Revise each article once against the skills before saving: read it as a first-time reader, cut
filler, check every claim against its source. Then run
`pnpm tsx scripts/pipeline/prose-lint-cli.ts content/articles/<slug>.json` and rewrite every flagged
sentence (banned words, stock phrases, repeated phrases, extra em dashes, markup in titles).

## 4. Five languages

Write `title`, `hook`, every section (heading and body), `keyPoint` and `applySteps` in **all five
languages** (en, vi, fr, de, es) yourself, as natural text for educated adults rather than word for
word, keeping the same highlights and reference chips around the matching words:

- Vietnamese: the English term in italics in brackets after a technical term's first use, e.g.
  thiên kiến xác nhận (*confirmation bias*).
- French: French typography (space before : ; ? ! and « guillemets »).
- German: "du" only where the English addresses the reader directly.
- Spanish: neutral international Spanish with opening ¿ and ¡.

Add a `glossary` per language: 8–14 terms copied exactly from that language's text (1–3 words), each
with a meaning in context of at most 20 words (rules in `scripts/pipeline/translate.ts`). Anything
left out is filled later by the Translations workflow, but a complete article is the goal.

## 5. Covers (Unsplash)

Every article gets its own Unsplash photo; never reuse one another article has (the script refuses).

1. Choose 2–4 concrete search words for the subject (things a camera can capture, e.g.
   "honeybee honeycomb macro", not "cooperation").
2. Find a striking portrait-friendly photo: with `UNSPLASH_ACCESS_KEY` set, run
   `pnpm tsx scripts/dev/unsplash-cover.ts --search "<words>"`; otherwise scrape
   `https://unsplash.com/s/photos/<words>` with Firecrawl and open a photo page
   (`https://unsplash.com/photos/<slug-id>`). Prefer sharp, well-lit photos with one clear subject
   and room for the title; skip photos with text, logos or recognisable faces as the subject.
3. Set the cover:
   - with the key: `pnpm tsx scripts/dev/unsplash-cover.ts <slug> <photo URL or id>`;
   - without it: take the image URL (`og:image`, starting `https://images.unsplash.com/`), the
     photographer's name and `@handle` from the photo page and run
     `pnpm tsx scripts/dev/unsplash-cover.ts <slug> <photo URL> --raw <image URL> --author "<name>" --username <handle>`.

The script serves the photo from Unsplash's CDN in portrait and landscape and credits the
photographer; the download is reported to Unsplash when the article is deployed.

## 6. Check and publish

1. `pnpm validate` must report no errors for the new files; fix and re-run. The length warning for
   group 4 is 1,000–1,800 words.
2. `pnpm content` must succeed.
3. Commit only the new `content/articles/*.json` files, as `reader-writer <noreply@anthropic.com>`,
   message `content: daily written articles YYYY-MM-DD`.
4. `git pull --rebase origin main`, then `git push origin HEAD:main`. The deploy workflow builds and
   publishes the site.

If validation keeps failing for an article, drop that article rather than publishing it broken.
Finish with a short report: how many articles were published, their titles, categories and word
counts, which tool read the sources, and anything dropped and why.
