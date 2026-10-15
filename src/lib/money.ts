/**
 * Money, without floating point.
 *
 * `0.1 + 0.2` is not `0.3` in JavaScript, and a budget field is exactly the
 * place where that stops being a curiosity: a seller types 1250.45, the page
 * multiplies it by 30 days, and the total that reaches the database is a
 * hundredth of a cent out. The database side of this is numeric(14,2) and
 * never sees a float; this is the browser keeping the same promise.
 *
 * So an amount here is a `bigint` count of the currency's smallest unit --
 * 1,250.45 USD is 125045n, and 1,250 RWF is 1250n, because the franc has no
 * smaller unit. Nothing is a `number` except the number of days, and nothing
 * is parsed or printed except through this file.
 *
 * Amounts cross to the database as decimal *strings* for the same reason:
 * JSON has only doubles, so `{"amount": 1250.45}` would be a double by the
 * time Postgres read it. `{"amount": "1250.45"}` is cast to numeric exactly.
 */

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  minor_units: number;
  /** The smallest step an amount may land on, as the database wrote it. */
  rounding_step: string | number;
  is_active: boolean;
  sort: number;
};

/** The franc, so a page has something sane to render before the list loads. */
export const RWF: Currency = {
  code: "RWF", name: "Rwandan Franc", symbol: "FRw",
  minor_units: 0, rounding_step: 1, is_active: true, sort: 0,
};

const TEN = 10n;
const pow10 = (n: number) => TEN ** BigInt(n);

/**
 * A typed amount as a count of minor units, or null when it is not an amount.
 *
 * Rejects what a person actually types wrong -- a comma, a currency symbol,
 * two dots, a minus sign -- rather than coercing it. `Number("1,250")` is
 * NaN and `parseFloat("1,250")` is 1, and neither is a budget.
 */
export function parseMoney(input: string, minorUnits: number): bigint | null {
  const text = String(input ?? "").trim();
  if (!/^[0-9]{1,15}(\.[0-9]{1,6})?$/.test(text)) return null;

  const [whole, fraction = ""] = text.split(".");
  // More decimals than the currency has is a typo, not a rounding problem:
  // somebody typing 1.005 USD meant something and we should not guess which.
  if (fraction.replace(/0+$/, "").length > minorUnits) return null;

  const padded = (fraction + "0".repeat(minorUnits)).slice(0, minorUnits);
  return BigInt(whole) * pow10(minorUnits) + BigInt(padded || "0");
}

/** Minor units back to the decimal string the database is given. */
export function moneyToString(minor: bigint, minorUnits: number): string {
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(minorUnits + 1, "0");
  const whole = digits.slice(0, digits.length - minorUnits) || "0";
  const fraction = minorUnits > 0 ? `.${digits.slice(digits.length - minorUnits)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** A decimal string from the database (or a JSON number) as minor units. */
export function moneyFromDb(value: string | number | null | undefined, minorUnits: number): bigint | null {
  if (value === null || value === undefined) return null;
  // Postgres hands numeric back as a string through PostgREST; a plain number
  // can still arrive from a jsonb_build_object, so both are accepted and both
  // go through the same decimal parse rather than through Number arithmetic.
  const text = typeof value === "number" ? value.toString() : value;
  return parseMoney(text, minorUnits) ?? parseMoney(Number(text).toFixed(minorUnits), minorUnits);
}

/** The currency's smallest allowed step, in minor units (at least 1). */
export function stepMinor(currency: Currency): bigint {
  const parsed = moneyFromDb(currency.rounding_step, currency.minor_units);
  return parsed && parsed > 0n ? parsed : 1n;
}

/**
 * An amount on the currency's own step, rounding half away from zero -- the
 * same rule Postgres `round()` uses, so money_round() in the database and
 * this function cannot disagree about a figure the seller was shown.
 */
export function roundToStep(minor: bigint, currency: Currency): bigint {
  const step = stepMinor(currency);
  if (step <= 1n) return minor;
  const negative = minor < 0n;
  const value = negative ? -minor : minor;
  const remainder = value % step;
  const rounded = remainder * 2n >= step ? value - remainder + step : value - remainder;
  return negative ? -rounded : rounded;
}

/** A day rate for a number of days, exactly, then put on the currency's step. */
export function totalFor(dailyRate: bigint, days: number, currency: Currency): bigint {
  if (!Number.isInteger(days) || days < 1) return 0n;
  return roundToStep(dailyRate * BigInt(days), currency);
}

/**
 * The amount as somebody reads it: "FRw 450,000", "$1,250.45".
 *
 * Intl does the grouping and the decimals, which is what it is for, but it is
 * given a string-built number only after the arithmetic is finished -- the
 * float appears at the last possible moment, for display, and never flows
 * back into a stored amount.
 */
export function formatAmount(minor: bigint, currency: Currency, options?: { code?: boolean }): string {
  const decimal = moneyToString(minor, currency.minor_units);
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: currency.minor_units,
    maximumFractionDigits: currency.minor_units,
  }).format(Number(decimal));
  return options?.code
    ? `${formatted} ${currency.code}`
    : `${currency.symbol}${currency.minor_units > 0 ? "" : " "}${formatted}`;
}

/**
 * How a currency is named where the choice is being made: the code first,
 * because ISO 4217 is the unambiguous part, then the name and the symbol.
 * "KES — Kenyan Shilling (KSh)" tells a seller everything the three letters
 * on their bank statement do not.
 */
export const currencyLabel = (c: Currency) => `${c.code} — ${c.name} (${c.symbol})`;

/** The same amount said in words a page can put beside a converted figure. */
export function conversionNote(
  from: { minor: bigint; currency: Currency },
  to: { minor: bigint; currency: Currency },
  rate: { rate: number | string; readAt?: string | null },
): string {
  const read = rate.readAt ? new Date(rate.readAt) : null;
  const when = read && !Number.isNaN(read.getTime())
    ? read.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : "an undated reading";
  return `${formatAmount(from.minor, from.currency, { code: true })} is about ${formatAmount(
    to.minor, to.currency, { code: true },
  )} at 1 ${from.currency.code} = ${Number(rate.rate).toPrecision(6)} ${to.currency.code}, read ${when}`;
}
