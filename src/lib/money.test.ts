// Money arithmetic, which is the part a float would quietly get wrong.
//
// The cases here are the ones that actually reach a budget field: a thousand
// separator, a currency with no decimals, an amount multiplied by a number of
// days, and the figures that break IEEE 754 if they are ever `number`s.
import { describe, expect, it } from "vitest";
import {
  RWF, currencyLabel, formatAmount, moneyFromDb, moneyToString, parseMoney,
  roundToStep, stepMinor, totalFor, type Currency,
} from "./money";

const USD: Currency = {
  code: "USD", name: "US Dollar", symbol: "$",
  minor_units: 2, rounding_step: "0.01", is_active: true, sort: 1,
};
// A shilling that ISO gives two decimals and nobody quotes cents in: the
// currency keeps its decimals, the step is coarsened to a whole unit.
const TZS: Currency = {
  code: "TZS", name: "Tanzanian Shilling", symbol: "TSh",
  minor_units: 2, rounding_step: "1", is_active: true, sort: 5,
};

describe("reading a typed amount", () => {
  it("reads a whole number of francs", () => {
    expect(parseMoney("450000", 0)).toBe(450000n);
    expect(parseMoney(" 450000 ", 0)).toBe(450000n);
  });

  it("reads dollars and cents exactly", () => {
    expect(parseMoney("1250.45", 2)).toBe(125045n);
    expect(parseMoney("1250.4", 2)).toBe(125040n);
    expect(parseMoney("1250", 2)).toBe(125000n);
    expect(parseMoney("0.01", 2)).toBe(1n);
  });

  it("refuses what a person actually types wrong", () => {
    // Number("1,250") is NaN and parseFloat("1,250") is 1. Neither is a
    // budget, so neither is accepted.
    for (const bad of ["450,000", "$450", "4 5 0", "", "   ", "-5", "1.2.3", "lots", "1e5"]) {
      expect(parseMoney(bad, 2)).toBeNull();
    }
  });

  it("refuses cents in a currency that has none", () => {
    // 450000.50 RWF is a typo, not something to round: half a franc does not
    // exist and guessing which way to go would be inventing money.
    expect(parseMoney("450000.50", 0)).toBeNull();
    expect(parseMoney("450000.00", 0)).toBe(450000n); // trailing zeros are not cents
  });

  it("refuses more decimals than the currency has", () => {
    expect(parseMoney("1250.455", 2)).toBeNull();
    expect(parseMoney("1250.450", 2)).toBe(125045n);
  });
});

describe("writing an amount back out", () => {
  it("round-trips through the decimal string the database is given", () => {
    for (const [text, units] of [["450000", 0], ["1250.45", 2], ["0.01", 2]] as const) {
      expect(moneyToString(parseMoney(text, units)!, units)).toBe(text);
    }
  });

  it("reads a numeric column back, whether it arrives as text or a number", () => {
    expect(moneyFromDb("1250.45", 2)).toBe(125045n);
    expect(moneyFromDb(1250.45, 2)).toBe(125045n);
    expect(moneyFromDb("450000", 0)).toBe(450000n);
    expect(moneyFromDb(null, 2)).toBeNull();
    expect(moneyFromDb(undefined, 2)).toBeNull();
  });

  it("reads a numeric that arrives with more decimals than the currency has", () => {
    // numeric(14,2) in a jsonb_build_object can come back as 1250.4500.
    expect(moneyFromDb("1250.4500", 2)).toBe(125045n);
    expect(moneyFromDb("450000.00", 0)).toBe(450000n);
  });
});

describe("rounding to what a currency can be paid in", () => {
  it("leaves an amount alone when the step is one minor unit", () => {
    expect(roundToStep(125045n, USD)).toBe(125045n);
    expect(stepMinor(USD)).toBe(1n);
  });

  it("rounds to the step when a currency is quoted in whole units", () => {
    expect(stepMinor(TZS)).toBe(100n);
    expect(roundToStep(125045n, TZS)).toBe(125000n); // 1250.45 -> 1250
    expect(roundToStep(125050n, TZS)).toBe(125100n); // half goes up, as Postgres does
    expect(roundToStep(125099n, TZS)).toBe(125100n);
  });

  it("rounds a franc amount not at all, because it is already whole", () => {
    expect(stepMinor(RWF)).toBe(1n);
    expect(roundToStep(450000n, RWF)).toBe(450000n);
  });
});

describe("a daily rate for a number of days", () => {
  it("multiplies exactly, where a float would not", () => {
    // 0.1 * 3 is 0.30000000000000004 in JavaScript. In minor units it is 30.
    const tenCents = parseMoney("0.10", 2)!;
    expect(totalFor(tenCents, 3, USD)).toBe(30n);
    expect(moneyToString(totalFor(tenCents, 3, USD), 2)).toBe("0.30");
  });

  it("holds a long run at an awkward rate", () => {
    const daily = parseMoney("1250.45", 2)!;
    expect(moneyToString(totalFor(daily, 365, USD), 2)).toBe("456414.25");
  });

  it("puts the total on the currency's step", () => {
    const daily = parseMoney("1250.45", 2)!;
    // 30 days is 37,513.50, which a shilling quoted in whole units rounds.
    expect(moneyToString(totalFor(daily, 30, TZS), 2)).toBe("37514.00");
  });

  it("refuses a nonsense number of days rather than guessing", () => {
    const daily = parseMoney("100", 0)!;
    expect(totalFor(daily, 0, RWF)).toBe(0n);
    expect(totalFor(daily, -3, RWF)).toBe(0n);
    expect(totalFor(daily, 1.5, RWF)).toBe(0n);
  });
});

describe("showing an amount to somebody", () => {
  it("puts the currency beside every figure", () => {
    expect(formatAmount(450000n, RWF, { code: true })).toBe("450,000 RWF");
    expect(formatAmount(125045n, USD, { code: true })).toBe("1,250.45 USD");
  });

  it("uses the symbol when the code is not wanted", () => {
    expect(formatAmount(125045n, USD)).toBe("$1,250.45");
    expect(formatAmount(450000n, RWF)).toBe("FRw 450,000");
  });

  it("names a currency so three letters are not the only clue", () => {
    expect(currencyLabel(USD)).toBe("USD — US Dollar ($)");
  });
});
