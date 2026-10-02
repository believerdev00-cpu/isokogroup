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

Both run without a Supabase token (`verify_jwt = false` in `supabase/config.toml`)
and use the service-role key inside the function only. Nothing in the browser
ever holds a model key, a search key or the service-role key.

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

## Deploying

```
supabase functions deploy research-ask research-sitemap
```

after the migration is applied and the secrets are set. The website's
`vercel.json` rewrites `/sitemap-research.xml` to the sitemap function and
`public/robots.txt` points search engines to it.
