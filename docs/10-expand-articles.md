# 10 — Lengthening short articles (Claude routine)

Most articles published before the Pagemoor standard are under 1,000 English words (339 of 393 on
2026-11-15, group 3 left out). Every one of them came from a page on the web, so the job is **not to
rewrite them**: it is to go back to that page and the article's other sources, and bring in what the
article left out, until it explains its subject in depth. A scheduled Claude routine ("Pagemoor
article expander") does this every day for **25 articles**, in the order
`pnpm tsx scripts/pipeline/short-articles.ts --limit 25` prints (published first, most read first,
then newest); the list shrinks as articles pass 1,000 words.

## 1. Read the article and its sources

- Read the article file and every source it names: `origin.originalUrl` first, then each entry in
  `references`. Open them through the Firecrawl connector (scrape); use WebFetch only when Firecrawl
  fails, and say so in the report. The Europe PMC and Wikipedia APIs (docs/09 §2) reach papers and
  background when a site blocks the session.
- Note what the source has that the article does not: steps of the mechanism, numbers, the history of
  the finding, the evidence and its limits, examples, what is still unknown.
- Never cite a page you have not read. Every fact you add comes from a source you opened.

## 2. Lengthen it, by licence group

Keep the article's existing text: fix a sentence only where the new material makes it wrong or where
the joins need it. Add paragraphs and sections with the material from §1.

- **Group 1 (CC BY, CC BY-NC, public domain) and group 2 (CC BY-SA):** the import kept about 700–950
  words of a longer original. Bring back, in adapted form, the parts of the original that were cut,
  and add material from the article's other references. Keep the licence and authors; add
  `"lengthened from the original"` to `origin.changes` (once). Group 2 stays share-alike.
- **Group 4 (written for Reader):** add material from its references and, where they run out, from
  1–3 new sources you add to `references`.
- **Group 5 (summary of a copyrighted page):** a summary of one copyrighted page may not grow into a
  replacement for it (the validator stops group 5 at 450 words). Turn it into Pagemoor's own article:
  keep its facts with the page as reference `source`, add at least two further sources (Wikipedia,
  papers, agencies, Our World in Data), write the new parts in your own words with quotations under 8
  words, and set `origin` to `{ group: 4, license: "Reader-CC-BY-4.0", authors: ["Claude for Reader"],
  changes: [] }` (drop `originalUrl`, `originalTitle` and `publisher`).
- **Group 3 (CC BY-ND):** never touched; `short-articles.ts` leaves it out.

Shape after lengthening: hook 40–110 words, 6–8 sections with headings, each at most 240 words,
**1,000–1,500 English words** in total; 1–2 highlights (`[y:…]`, `[p:…]`, `[g:…]`) and at least one
`{ref-id}` chip in every section, the chip right after the claim it supports. Follow `WRITING_RULES`
in `scripts/pipeline/gemini.ts` and the skills `avoid-ai-writing` and
`creative-writing-skills:llm-writing` for the new text. Keep the title, slug, category, cover and
`publishAt` as they are; a draft stays a draft.

## 3. Every language

The other languages must say what the English says. For each section you changed or added, write the
`heading_*` and `body_*` again in vi, fr, de and es (natural text, same highlights and chips, docs/09
§4), fill any language the article never had, update `hook`, `keyPoint` and `applySteps` if they
changed, and add glossary terms for the new text so each language has 8–14.

## 4. Check and publish

1. `pnpm tsx scripts/pipeline/standard-cli.ts --expanded <slugs>` passes for each article: 1,000+
   words, a highlight and a source chip in every section, all five languages, glossaries of 8+ terms.
2. `pnpm tsx scripts/pipeline/prose-lint-cli.ts <files>` passes for the new text, `pnpm validate`
   shows no errors for these articles, and `pnpm content` succeeds.
3. Commit only the changed `content/articles/*.json` files, as `reader-writer
   <noreply@anthropic.com>`, message `content: lengthened articles YYYY-MM-DD`, then
   `git pull --rebase origin main` and `git push origin HEAD:main`.

An article whose sources cannot be opened, or that still fails the checks, is left as it was: restore
its file and name it in the report. Finish with a short report: each article's slug, group, words
before and after, the sources used, and anything skipped and why.
