# Bunny Stream

Films longer than about twenty minutes cannot live in Supabase Storage. The
project's upload ceiling is 50 MB (the free plan's, applied to every bucket at
once, enforced before a byte is sent), so a two-hour film has nowhere to go.
Bunny Stream is where it goes instead, and `supabase/functions/bunny-video` is
the only thing that holds the keys.

**Status: coded, not configured.** The function is written and tested; the
three secrets below are not set on production, and no title uses
`watch_source = 'bunny'` yet. Until they are set, the film library cannot hold
a film.

## The three secrets

All three are read in `supabase/functions/bunny-video/index.ts:33-35` and
nowhere else. None of them ever reaches the browser.

| Secret | Where it comes from |
| --- | --- |
| `BUNNY_STREAM_LIBRARY_ID` | Stream → your library → **API** tab. Listed there as *Video Library ID*, alongside the CDN hostname and pull zone. A short number. |
| `BUNNY_STREAM_API_KEY` | The same **API** tab, as *API Key*. This is the **library's** key, not the bunny.net account API key — the account key is rejected by the Stream API. |
| `BUNNY_STREAM_TOKEN_KEY` | Stream → your library → **Security** tab, the *Token authentication key* card. |

### The trap worth knowing about

The Security page's field is **also labelled "API key"**, and it is a different
value from the one on the API tab. Mixing them produces a signature that is
perfectly well-formed and is refused — a 403 at playback with nothing to read.
This is already written down in `sign.ts`; it is repeated here because the two
fields really do carry the same label.

Token authentication must also be **enabled** on that Security page. Left off,
the embed plays for anyone who has the URL, signed or not — which quietly
removes the entire reason this function exists.

## Setting them

```sh
# production
npx supabase secrets set --project-ref oswetaksxcepublsjyrt \
  BUNNY_STREAM_LIBRARY_ID=... \
  BUNNY_STREAM_API_KEY=... \
  BUNNY_STREAM_TOKEN_KEY=...

npx supabase functions deploy bunny-video --project-ref oswetaksxcepublsjyrt

# confirm all three are present (values are hashed in the listing, which is fine
# -- what matters is that the names are there)
npx supabase secrets list --project-ref oswetaksxcepublsjyrt | grep -o 'BUNNY_[A-Z_]*'
```

Staging is `amfkajwkfyroskzneoiy`, and is worth doing first.

## What the function expects of Bunny

Two signatures, in `sign.ts`, both matching Bunny's published formats:

- upload — `SHA256(library_id + api_key + expiration + video_id)`, sent as the
  `AuthorizationSignature` header alongside `AuthorizationExpire`, `LibraryId`
  and `VideoId` to the TUS endpoint;
- playback — `SHA256(token_security_key + video_id + expiration)`, appended to
  the embed URL as `?token=...&expires=...`, with `expires` a UNIX time in
  seconds.

**Do not "fix" the embed hostname.** The code uses
`iframe.mediadelivery.net`; one current documentation page shows
`player.mediadelivery.net` instead. Checked on 2026-10-12: `iframe` answers
200 and `player` answers 404 for the embed path. The code is right.

## Proving it works

Switch one short, already-working title before trusting it with a film:

1. Upload a clip through the media desk with the library configured.
2. `select watch_source, watch_ref, video_id from ent_titles where slug = '...'`
   — `watch_source` should be `bunny` and `video_id` a GUID.
3. Play it signed out: it should refuse with *"This video is for subscribers."*
4. Play it as a subscriber: it should play.
5. Copy the embed URL out of the page and open it after `expires` has passed:
   it should 403 rather than play.

Step 5 is the one that proves token authentication is actually switched on. If
it plays, the Security page toggle is off and the gate is decorative.

## Cost

Bunny publishes a $1/month minimum, storage from $0.01/GB and delivery priced
by region (roughly $0.01/GB Europe and North America, $0.06/GB Middle East and
Africa). Third-party summaries disagree on the trial terms, so read
<https://bunny.net/pricing/stream> before committing. For a handful of films
and modest traffic this is single-digit dollars a month.

## Related

- `supabase/functions/bunny-video/index.ts` — the only holder of the keys
- `supabase/functions/bunny-video/sign.ts` — both signature formats, with tests
- `supabase/migrations/20261011130000_bunny_stream.sql` — the columns
- `supabase/migrations/20261011140000_bunny_processing.sql` — processing states
- `docs/DEPLOYMENT.md` — project refs and the deploy routine
