import { pool, query, type Queryable } from "../db.js";
import { today } from "./settings.js";

/** One line of the website's moving intake band. */
export type IntakeAnnouncement = {
  id: string;
  name: string;
  slug: string;
  location: string;
  application_opens_on: string;
  application_closes_on: string;
  training_starts_on: string;
  is_featured: boolean;
  ticker_priority: number;
  /** What the band says about it, decided here from the dates, the status and the free seats. */
  state: "closing_soon" | "open" | "coming_soon";
  /** Days until the application deadline, for an intake whose dates still govern it. */
  days_left: number | null;
  program_count: number;
  /** Up to three program names, so the band can say what the intake is for. */
  programs: string[];
};

/** An intake is "closing soon" when its deadline is this many days away or nearer. */
export const CLOSING_SOON_DAYS = 7;

/**
 * The intakes the website may announce, in the order it should show them.
 *
 * Only intakes an admin published and left in the band (show_in_ticker) and that
 * are open or about to open. An open intake also has to be really bookable: in
 * its application window, with a program that is accepting and has a free seat.
 * So a full, closed, completed, archived or draft intake is never advertised,
 * and an intake with nothing left to apply for drops out by itself.
 *
 * Featured intakes come first, then the admin's priority, then the ones about to
 * close, the rest of the open ones, and finally the ones that are coming.
 */
export async function intakeAnnouncements(client: Queryable = pool): Promise<IntakeAnnouncement[]> {
  const d = await today(client);
  return query<IntakeAnnouncement>(
    `SELECT i.id, i.name, i.slug, i.location,
            i.application_opens_on, i.application_closes_on, i.training_starts_on,
            i.is_featured, i.ticker_priority,
            CASE WHEN i.status = 'upcoming' THEN 'coming_soon'
                 WHEN i.status_mode = 'auto' AND i.application_closes_on - $1::date <= $2 THEN 'closing_soon'
                 ELSE 'open' END AS state,
            CASE WHEN i.status = 'open' AND i.status_mode = 'auto'
                 THEN greatest(i.application_closes_on - $1::date, 0) END AS days_left,
            count(*)::int AS program_count,
            (array_agg(p.name ORDER BY p.name))[1:3] AS programs
     FROM intakes i
     JOIN intake_programs ip ON ip.intake_id = i.id
     JOIN programs p ON p.id = ip.program_id AND p.is_active
     JOIN intake_program_stats s ON s.intake_program_id = ip.id
     WHERE i.show_in_ticker
       AND i.status IN ('open', 'upcoming')
       -- an open intake only counts while it really takes applications
       AND (i.status <> 'open'
            OR ((i.status_mode = 'manual' OR $1::date BETWEEN i.application_opens_on AND i.application_closes_on)
                AND s.accepting_applications AND s.available_seats > 0
                AND (s.application_closes_on IS NULL OR $1::date <= s.application_closes_on)))
     GROUP BY i.id
     ORDER BY i.is_featured DESC, i.ticker_priority DESC,
              CASE WHEN i.status = 'upcoming' THEN 2
                   WHEN i.status_mode = 'auto' AND i.application_closes_on - $1::date <= $2 THEN 0
                   ELSE 1 END,
              i.application_closes_on, i.training_starts_on, i.name`,
    [d, CLOSING_SOON_DAYS],
    client,
  );
}
