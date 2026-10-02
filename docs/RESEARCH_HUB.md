# ISOKO Information & Research Hub

The hub at `/research` is ISOKO's knowledge base of statistics, research, studies,
reports and findings about Rwanda and the region, with a question box that
answers in plain words. This page covers the server side: the two Edge
Functions, the secrets they need, how answers are produced, and how to test
them locally. The database schema and the pages are described in the migration
`supabase/migrations/20261003100000_research_hub.sql` and the code under
`src/features/research` and `src/features/staff/research`.

## The two functions

| Function | Method | Who calls it | What it does |
| --- | --- | --- | --- |
| `research-ask` | POST | the question box on the website | answers a question from the knowledge base, then from outside when needed |
| `research-sitemap` | GET | search engines (via `/sitemap-research.xml`) | lists every public item, country and topic as XML |
| `research-ingest` | POST | the staff desk ("Create from a document") | turns an uploaded PDF, spreadsheet or text file into a draft item with its figures |
| `research-import` | POST | a weekly cron, or the staff desk ("Import now") | publishes World Bank indicator series for every active country |

The first two run without a Supabase token (`verify_jwt = false` in
`supabase/config.toml`); `research-ingest` requires one (`verify_jwt = true`)
and both staff functions check `is_service_staff('data')` themselves (see
"How the knowledge base fills itself"). All use the service-role key inside
the function only. Nothing in the browser ever holds a model key, a search key
or the service-role key.

## How an answer is produced

1. **The question is checked.** Between 3 and 300 characters, optionally with a
   country slug. Anything else is a `400`.
2. **The caller is rate-limited.** A hash of the signed-in user id, or of the
   address, is counted in `research_ask_log`: 30 questions an hour, then `429`.
   The raw address is never stored.
3. **The cache is read.** The same question (lower-cased, spaces collapsed,
   trailing question marks dropped) in the same country within 24 hours comes
   back from `research_answers` with `cached: true`. A cached repeat does not
   count as a new question.
4. **The knowledge base is searched first** with `research_search` (public
   items only, never drafts): the best 8 matches, their bodies and their sources.
5. **Is that enough?** Yes when at least one item clearly matches (a ranked
   full-text hit, or a title sharing a word with the question) and the matching
   text is at least 200 characters. Then nothing outside is read.
6. **Otherwise, outside.** The configured search provider (Tavily or Serper)
   returns up to 5 results: blocked domains are dropped, preferred domains
   (official statistics, government, universities) come first, 8 second timeout.
7. **The model writes one answer** from that material only. It is told to say
   "I could not find enough reliable information about this yet." when the
   material does not cover the question, never to invent a figure, and to give
   both figures with their dates and methods when sources disagree. It replies
   as JSON: the answer, which items and which addresses it used, and any
   conflicts it noticed. The words "internal", "external", "database" and
   "search" never appear in what it is asked, so they cannot appear in answers.
8. **Provenance is kept.** The answer, mode, item ids, sources and conflicts
   are stored in `research_answers`; the question (only the text) is counted in
   `research_questions` for the trending list. A rate-limited request records
   nothing.

If the model is not configured, declines, times out or fails, the matching
items are still returned, `answer` is `null` and `ai` is `false`. If the
search provider fails, the engine answers from what it has. Failures are logged
without secrets.

## Request and response

```
POST /functions/v1/research-ask
Content-Type: application/json
{ "question": "What is the population of Rwanda?", "country": "rwanda" }
```

`country` is optional (a country slug).

```json
{
  "answer": "…one short plain-text answer, or null…",
  "mode": "kb | kb_external | external | none",
  "items": [{ "id", "slug", "kind", "title", "summary", "country_name", "topic_name", "published_on", "verification" }],
  "sources": [{ "title", "url", "publisher" }],
  "conflicts": [{ "topic", "note" }],
  "cached": false,
  "ai": true
}
```

Errors: `400 { "error": "…" }` for bad input, `429 { "error": "Too many questions. Try again in a few minutes." }`
with `Retry-After: 600`, `500 { "error": "The information service is not available right now. Please try again." }`.

The sitemap:

```
GET /functions/v1/research-sitemap   →  application/xml, Cache-Control: public, max-age=3600
```

It lists `/research`, `/research/countries/<slug>` for active countries,
`/research/topics/<slug>`, and `/research/<slug>` with `lastmod` for every
published item (and scheduled items whose time has come).

## Secrets

Set on the Supabase project with `supabase secrets set NAME=value` (or Dashboard
> Edge Functions > Secrets). They are listed with placeholders in `.env.example`.

| Name | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | the model that writes answers; without it, items only and `ai: false` |
| `RESEARCH_MODEL` | model id; empty = `claude-sonnet-5-5` |
| `EXTERNAL_SEARCH_PROVIDER` | `tavily` or `serper`; empty = knowledge base only |
| `TAVILY_API_KEY` / `SERPER_API_KEY` | that provider's key |
| `EXTERNAL_SEARCH_PREFERRED_DOMAINS` | comma-separated domains read first |
| `EXTERNAL_SEARCH_BLOCKED_DOMAINS` | comma-separated domains never read |
| `SITE_ORIGINS` | website origins allowed to call `research-ask` from a browser |
| `PUBLIC_SITE_URL` | public address used in the sitemap (default `https://www.isokogroups.com`) |
| `RESEARCH_MOCK` | `1` fakes outside results and the answer; **local only**, ignored on hosted Supabase |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

## Testing

Pure logic (normalization, hashing, sufficiency, domain filtering, the prompt,
reading the model's reply, both providers against a stubbed `fetch`), no
network:

```
npx vitest run supabase/tests/research-ask.test.ts
```

End to end against a local Supabase with the migration applied, in mock mode
(no key of any kind):

```
RESEARCH_MOCK=1 supabase functions serve research-ask research-sitemap
node supabase/tests/research-ask.e2e.mjs
```

The script seeds one published item, checks CORS, bad input, a knowledge-base
answer, the cache, an outside (mock) answer, the trending list, the rate limit,
and the sitemap (including that a draft disappears), then removes what it
created. It refuses any address other than 127.0.0.1 / localhost.

To try a real answer locally, set `ANTHROPIC_API_KEY` (and optionally a search
provider) in the environment of `supabase functions serve` and leave
`RESEARCH_MOCK` unset.

## How the knowledge base fills itself

Beside what staff type in by hand, three feeds add to the hub. Items remember
where they came from (`import_source`: `question`, `document` or `worldbank`),
carry the key that keeps a re-run from duplicating them, and tell the analyst
what to check (`review_note`). Every run is logged in `research_imports`, which
the staff desk shows under Imports. Migration:
`supabase/migrations/20261003110000_research_feeds.sql`.

### The review queue (research-ask)

When the engine had to answer from outside sources (`mode` is `external` or
`kb_external`) and wrote an answer, it also saves **one draft** for an analyst:

- kind `finding`, status `draft`, origin `external`, verification `unverified`;
- the question as the title, the answer as summary and body, the asked country,
  up to 8 keywords from the question;
- the outside sources it used, as `research_sources` rows;
- the figures the model listed, as `research_stats` rows. The model's JSON now
  has an optional `figures` list (label, value, unit, period, source address)
  and is told to list only numbers that appear in the material. A figure's
  address is kept only when it is one of the notes the model was given.

The draft is keyed by `review_hash` (the same hash as the answer cache). A
cached repeat creates nothing; a fresh answer to the same question finds the
existing draft and leaves it alone (`ON CONFLICT DO NOTHING`), so nothing an
analyst edited is ever overwritten. The public response does not change.

Analysts work the queue at `/staff/research/review` (RPC `research_review_queue`),
open a draft in the editor, publish it or discard it (`research_discard_draft`,
which removes only drafts a feed created).

### Documents (research-ingest)

```
POST /functions/v1/research-ingest        (Supabase token required, data staff only)
{ "path": "ingest/<file>", "country": "rwanda", "kind": "report", "title": "..." }
-> 200 { "item_id", "slug", "title", "figures": 2, "chars": 1840 }
```

`country`, `kind` and `title` are optional. The staff desk's "Create from a
document" button uploads the file to the private `research` bucket under
`ingest/` and calls this function with the path. What happens:

1. The caller must be data staff (`is_service_staff('data')`), else `403`.
2. The file (PDF, XLSX/XLS, CSV/TSV or TXT, at most 25 MB) is downloaded with
   the service role and read: PDF text with `unpdf`, spreadsheets with `xlsx`,
   delimited files with the function's own parser.
3. Title (given, else the first line that reads like one, else the file name),
   summary (first paragraphs, at most 1000 characters) and body (at most
   50 000 characters; tables become `label: value` lines) are derived.
4. Figures are found by heuristics: in spreadsheets, rows whose first cell is
   text and another cell is a number (unit from a "unit" column, period from a
   year column or a year cell; wide tables with year columns give one figure per
   year); in text, lines like `Population: 13,246,394 people (2022)`. At most 60.
5. When `ANTHROPIC_API_KEY` is set and the text is under 12 000 characters, the
   model is asked to improve the title, summary and figures with the same rule
   as the answer engine: never invent; a figure whose number is not in the text
   is dropped. Any model failure falls back to the heuristics.
6. A draft item is created (`import_source` `document`, origin `isoko`, the
   caller as author, review note "Extracted from <file> on <date>; check the
   text and figures."), its stats, a `research_documents` row (the file is moved
   under `<item id>/` when the move succeeds), and a `research_imports` row.

Errors: `400` bad input or unsupported type, `401` no user, `403` not data
staff, `404` no such file, `413` over 25 MB, `422` no readable text (the file is
kept, nothing is created, the failed run is logged), `500` otherwise.

NISR (the National Institute of Statistics of Rwanda) publishes reports and
tables but no public API the hub could read on a schedule, so its publications
are added this way: download the PDF or Excel file from NISR, upload it through
"Create from a document", check the draft, publish.

### The World Bank connector (research-import)

```
POST /functions/v1/research-import        (no Supabase token check; see callers)
{ "country": "rwanda", "indicators": ["SP.POP.TOTL"] }
-> 200 { "runs": [{ "country": "rwanda", "created": 0, "updated": 15, "failed": 0 }], "total_created": 0, "total_updated": 15 }
```

Both fields are optional: by default every active country and all 15
indicators. Accepted callers: the service-role key (the cron) or a signed-in
member of the data staff (the "Import now" button). Anyone else gets `401` or
`403`; an unknown country or indicator code gets `400`.

For each country and indicator the World Development Indicators API is read
(`https://api.worldbank.org/v2/country/{ISO2}/indicator/{code}?format=json&per_page=100&date=1990:{year}`,
one request at a time, 8 second timeout; after 3 failures in a row the run
stops and the rest is counted as failed). Each pair becomes one **published**
statistic item keyed by `import_key` `worldbank:{ISO2}:{code}`, slug
`{country}-{indicator}` (for example `rwanda-population-total`), origin
`external`, verification `unverified`, tags `world-bank`, filed under the
indicator's topic, with one `research_stats` row per year (series = the
indicator code, each row carrying the World Bank page address) and one
`research_sources` row. A repeat run updates the summary, period and dates and
replaces the series; the title is refreshed only while the item was never
verified; status and verification are never touched, so an analyst's archive
or verification stands. One `research_imports` row is written per country.

| Code | Indicator | Topic |
| --- | --- | --- |
| SP.POP.TOTL | Population, total | population |
| SP.POP.GROW | Population growth (annual %) | population |
| NY.GDP.MKTP.CD | GDP (current US$) | economy |
| NY.GDP.PCAP.CD | GDP per capita (current US$) | economy |
| NY.GDP.MKTP.KD.ZG | GDP growth (annual %) | economy |
| FP.CPI.TOTL.ZG | Inflation, consumer prices (annual %) | economy |
| SL.UEM.TOTL.ZS | Unemployment (% of labour force) | employment |
| ST.INT.ARVL | International tourist arrivals | tourism |
| SP.DYN.LE00.IN | Life expectancy at birth (years) | health |
| SE.PRM.ENRR | School enrolment, primary (% gross) | education |
| SE.SEC.ENRR | School enrolment, secondary (% gross) | education |
| IT.NET.USER.ZS | Individuals using the Internet (% of population) | technology |
| EG.ELC.ACCS.ZS | Access to electricity (% of population) | infrastructure |
| AG.LND.AGRI.ZS | Agricultural land (% of land area) | agriculture |
| SP.URB.TOTL.IN.ZS | Urban population (% of total) | housing |

Activating another country in the staff desk (Countries) is enough for the next
run to import it.

**The weekly run.** Once in production, schedule it in SQL the same way as the
notification dispatcher in `docs/DEPLOYMENT.md` (`pg_cron` and `pg_net` enabled;
the service-role key kept in Vault, never in the job):

```sql
-- once: keep the key in Vault (skip if notifications_dispatch_key already exists; reuse it then)
SELECT vault.create_secret('<service_role key>', 'research_import_key');
-- every Monday at 03:17 UTC
SELECT cron.schedule('research-import-weekly', '17 3 * * 1', $$
  SELECT net.http_post(
    url := 'https://oswetaksxcepublsjyrt.supabase.co/functions/v1/research-import',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'research_import_key')),
    body := '{}'::jsonb)
$$);
```

### Testing the feeds

Pure logic (figures in the model's reply, the draft builder, CSV/TSV parsing,
figure detection in rows and text, title and summary derivation, the model
prompt and reply for documents, the World Bank JSON and item rows), no network:

```
npx vitest run supabase/tests/research-ask.test.ts supabase/tests/research-ingest.test.ts supabase/tests/research-import.test.ts
```

End to end against a local Supabase with both research migrations applied, in
mock mode (the answer engine fakes outside results and the answer with one
figure; the connector returns a fixed five-year series; ingestion skips only
the model):

```
RESEARCH_MOCK=1 supabase functions serve research-ask research-ingest research-import
node supabase/tests/research-feeds.e2e.mjs
```

The script creates a local data analyst and a plain user (and signs them in
for their tokens), then checks: an outside answer creates exactly one draft
with its sources and figure, a cached repeat and a re-ask create no second
draft and keep an analyst's edit; a CSV uploaded under `ingest/` becomes a
draft with two figures, the attached document and an import record, a plain
user gets `403`, a file without text gets `422`; the connector refuses callers
without rights, imports 15 indicators per active country, makes them public,
and a repeat run updates without duplicating while keeping the analyst's edits.
It removes everything it created, including every World Bank item in the local
database.

## Deploying

```
supabase functions deploy research-ask research-sitemap research-ingest research-import
```

after both migrations are applied and the secrets are set. The website's
`vercel.json` rewrites `/sitemap-research.xml` to the sitemap function and
`public/robots.txt` points search engines to it. Then schedule the weekly
import (above).
