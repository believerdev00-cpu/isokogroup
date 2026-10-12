import { supabase } from "@/integrations/supabase/client";

/**
 * Checks that what is in storage is the whole file, before anyone is told the
 * upload worked.
 *
 * A film on the live site turned out to be 24 bytes: an upload had reported
 * success, the desk saved the path, and the item was published. Nobody found
 * out until a visitor pressed play, and even then the player blamed their
 * browser. A resumable upload has several ways to end early and still leave an
 * object behind -- and a plain upload can be handed a cloud placeholder that
 * stands in for a file the machine never actually had -- so the only reliable
 * question is how many bytes arrived.
 *
 * It asks storage rather than trusting the uploader, and refuses rather than
 * guesses: a size that cannot be read is reported too, because publishing a
 * film nobody can watch is worse than one more upload.
 *
 * There is no threshold here for "implausibly small", because there is no size
 * a half-written file cannot sit above. Every byte arrived or it did not.
 *
 * This only works where the person uploading may also read the object back.
 * That holds for every caller today -- each bucket's read policy is the same as
 * its write policy or wider -- and is the thing to check before adding another:
 * a bucket that refused them the read would fail every upload.
 */
export async function assertStored(bucket: string, path: string, expected: number) {
  const { data, error } = await supabase.storage.from(bucket).info(path);

  // Storage answers "not found" both when nothing arrived and when the reader
  // may not look. Either way there is nothing to confirm, so both are refused
  // -- but the common one is worth saying plainly.
  if (error) {
    const status = (error as { statusCode?: string; status?: number }).statusCode ?? (error as { status?: number }).status;
    if (String(status) === "404") throw new Error(NOTHING_ARRIVED);
    throw new Error(`The upload could not be confirmed: ${error.message}. Please try again.`);
  }

  const size = Number(data?.size);
  if (!data || !Number.isFinite(size)) throw new Error(NOTHING_ARRIVED);
  if (size !== expected) {
    throw new Error(`The upload stopped early: ${megabytes(size)} of ${megabytes(expected)} arrived. Please try again.`);
  }
}

/**
 * The same check, as a message to show rather than an error to throw.
 *
 * Several upload sites report a failure by putting it in a toast and
 * returning, not by throwing, and turning those inside out into try/catch to
 * fit one helper would change more code than the check itself. They ask this.
 */
export async function storedProblem(bucket: string, path: string, expected: number): Promise<string | null> {
  try {
    await assertStored(bucket, path, expected);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const NOTHING_ARRIVED = "The upload did not finish: nothing arrived in storage. Please try again.";

/**
 * A size the person can act on. Bytes are exact and tell them nothing; a film
 * that arrived as "0.0 MB of 740.2 MB" says at a glance that the upload has to
 * be done again rather than investigated.
 */
const megabytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
