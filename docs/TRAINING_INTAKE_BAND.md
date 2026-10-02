# The live intake band on the homepage

A moving line of Training Center announcements sits straight under the main
navigation on the Isoko homepage. Each announcement is one intake; tapping it
opens that intake, where every program has an Apply Now button.

Nothing in the band is written by hand. It is built from the intakes admins
publish in the Training Center, so the only way to change it is to change an
intake.

## What an admin does

In **Training Center > Admin > Intakes**:

| To | Do this |
| --- | --- |
| announce a new intake | create it, add its programs, press **Publish** |
| have it shown first, marked "New intake" | turn on **Show it first** in the intake's **Homepage announcement** settings |
| set the order of the rest | **Order** (0 to 100, higher comes earlier) |
| keep one intake off the homepage but still open for applications | turn off **Announce this intake on the homepage** |
| take it off the site altogether | **Unpublish** on the intake's page (it becomes a draft again; applications already received are kept) |
| change the dates it announces | **Change dates** on the intake's page |

## What the band says, and why

The wording follows the intake's status, dates and free seats. No one sets it.

| The band says | When |
| --- | --- |
| Applications open | the intake is open and at least one program still has a seat |
| Closing in N days / Last day to apply | the application deadline is seven days away or nearer |
| Opens 16 Oct | the intake is published but its opening date has not come |
| nothing | the intake is a draft, full, closed, completed or archived |

An intake drops out of the band by itself when its deadline passes or its last
seat goes, because the Training Center recomputes the status after every
request. An admin who opened or closed an intake by hand keeps that decision;
the band then says only "Applications open" for it, with no countdown.

## How it is built

- `GET /public/announcements` on the Training Center API (`training-api/src/services/announcements.ts`)
  returns one row per intake with its state. It is never served from a browser
  cache, so an intake taken down disappears at once.
- `src/components/IntakeTicker.tsx` draws the band on `/` and asks again every
  five minutes, so a newly published intake appears without anyone reloading.
- The movement is CSS only (`.intake-ticker-track` in `src/index.css`): the
  announcements are listed twice so the loop never jumps, and one pass takes as
  long as the text needs, which keeps the reading speed the same however many
  intakes there are.
- It stops while the pointer rests on it, while a finger is on it, while a link
  in it has keyboard focus, and when the **Pause** button is pressed.
- A visitor whose device asks for less motion gets the same announcements as a
  row they can swipe, with no movement at all.
- The band draws nothing when there is nothing to announce or the Training
  Center cannot be reached, so the homepage is never broken by it.

## Columns

`training.intakes` carries `show_in_ticker`, `is_featured` and `ticker_priority`
(migration `20261003120000_training_intake_ticker.sql`). Intakes that existed
before the migration keep being announced; none of them is featured.

## Checking it

```bash
npm --prefix training-api run test        # the band's rules, 10 checks in test/ticker.test.ts
npm run test:db                           # training_ticker.test.sql: the columns and that the schema stays closed
npx vitest run src/components/IntakeTicker.test.tsx
```
