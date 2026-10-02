// @vitest-environment node
//
// The pure logic of the research-ingest Edge Function: reading CSV/TSV, which
// rows and lines are figures, how a title, summary and body are derived, what
// the model is asked and how its reply is read. No network, no files.
//
//   npx vitest run supabase/tests/research-ingest.test.ts
import { describe, expect, it } from "vitest";
import {
  buildImprovePrompt, cleanText, deriveBody, deriveSummary, deriveTitle, detectDelimiter, detectType, draftSlug, figuresFromRows, figuresFromText,
  fileNameOf, hasHeader, KINDS, MAX_BODY, MAX_BYTES, MAX_FIGURES, MODEL_MAX_CHARS, numberAppears, parseDelimited, parseImprovement, reviewNote,
  rowsToText, unitFromHeader, validateInput,
} from "../functions/research-ingest/extract.ts";

describe("input and file types", () => {
  it("accepts only files uploaded under ingest/ of a readable type", () => {
    expect(validateInput({ path: "ingest/abc-report.pdf" })).toEqual({ path: "ingest/abc-report.pdf", country: null, kind: null, title: null });
    expect(validateInput({ path: "ingest/x.xlsx", country: "rwanda", kind: "dataset", title: "  Census   2022 " })).toEqual({ path: "ingest/x.xlsx", country: "rwanda", kind: "dataset", title: "Census 2022" });
    expect(validateInput({ path: "other/x.pdf" })).toHaveProperty("error");
    expect(validateInput({ path: "ingest/../x.pdf" })).toHaveProperty("error");
    expect(validateInput({ path: "ingest/x.docx" })).toHaveProperty("error");
    expect(validateInput({ path: "ingest/x.csv", country: "Rwanda!" })).toHaveProperty("error");
    expect(validateInput({ path: "ingest/x.csv", kind: "poem" })).toHaveProperty("error");
    expect(validateInput("nope")).toHaveProperty("error");
    expect(KINDS).toHaveLength(7);
  });
  it("knows the file types by extension and the size limit", () => {
    expect(detectType("ingest/a.PDF")).toBe("pdf");
    expect(detectType("ingest/a.xls")).toBe("xlsx");
    expect(detectType("ingest/a.tsv")).toBe("tsv");
    expect(detectType("ingest/a.txt")).toBe("txt");
    expect(detectType("ingest/a.zip")).toBeNull();
    expect(detectType("ingest/noext")).toBeNull();
    expect(fileNameOf("ingest/2026/report final.pdf")).toBe("report final.pdf");
    expect(MAX_BYTES).toBe(26214400);
    expect(MAX_FIGURES).toBe(60);
    expect(MODEL_MAX_CHARS).toBe(12000);
  });
});

describe("delimited text", () => {
  it("parses quoted cells, doubled quotes, CRLF and numbers", () => {
    const rows = parseDelimited(String.fromCharCode(0xfeff) + 'Indicator,Value,Unit,Year\r\n"Population, total","13,246,394",people,2022\r\n"Said ""hi""",2.5,%,2021\r\n,,,\r\n');
    expect(rows).toEqual([
      ["Indicator", "Value", "Unit", "Year"],
      ["Population, total", 13246394, "people", 2022],
      ['Said "hi"', 2.5, "%", 2021],
    ]);
  });
  it("detects tabs and keeps codes with leading zeros as text", () => {
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a,b\n1,2")).toBe(",");
    expect(parseDelimited("District\tCode\tValue\nGasabo\t0123\t45")).toEqual([["District", "Code", "Value"], ["Gasabo", "0123", 45]]);
  });
});

describe("figures", () => {
  it("reads a long table: label, first numeric cell, unit column, year cell", () => {
    const rows = parseDelimited("Indicator,Value,Unit,Year\nPopulation,13246394,people,2022\nGrowth rate,2.3,%,2022\nNotes only,,,\n,5,,");
    expect(hasHeader(rows)).toBe(true);
    expect(figuresFromRows(rows)).toEqual([
      { label: "Population", value: 13246394, unit: "people", period_label: "2022", source_url: null },
      { label: "Growth rate", value: 2.3, unit: "%", period_label: "2022", source_url: null },
    ]);
  });
  it("reads a wide table: one figure per year column", () => {
    const rows = parseDelimited("Indicator,2020,2021,2022\nExports (USD),100,110,\nImports (USD),200,210,220");
    const f = figuresFromRows(rows);
    expect(f).toHaveLength(5);
    expect(f[0]).toEqual({ label: "Exports (USD)", value: 100, unit: null, period_label: "2020", source_url: null });
    expect(f[4]).toEqual({ label: "Imports (USD)", value: 220, unit: null, period_label: "2022", source_url: null });
  });
  it("takes the unit from the value column's name and skips year cells as values", () => {
    const rows = parseDelimited("Region,Year,Share (%)\nKigali,2022,17.6\nNorth,2022,14.9");
    expect(figuresFromRows(rows)).toEqual([
      { label: "Kigali", value: 17.6, unit: "%", period_label: "2022", source_url: null },
      { label: "North", value: 14.9, unit: "%", period_label: "2022", source_url: null },
    ]);
    expect(unitFromHeader("Value (USD)")).toBe("USD");
    expect(unitFromHeader("Share %")).toBe("%");
    expect(unitFromHeader("Value")).toBeNull();
    expect(unitFromHeader(3)).toBeNull();
  });
  it("works without a header and stops at the limit", () => {
    expect(hasHeader([["a", 1], ["b", 2]])).toBe(false);
    expect(figuresFromRows([["Coffee", 100], ["Tea", "2,000", "2023"]])).toEqual([
      { label: "Coffee", value: 100, unit: null, period_label: null, source_url: null },
      { label: "Tea", value: 2000, unit: null, period_label: "2023", source_url: null },
    ]);
    const many = Array.from({ length: 80 }, (_, i) => [`row ${i}`, i]);
    expect(figuresFromRows(many)).toHaveLength(60);
    expect(figuresFromRows(many, 5)).toHaveLength(5);
    expect(figuresFromRows([])).toEqual([]);
  });
  it("finds figure lines in text", () => {
    const text = [
      "Population: 13,246,394 people (2022)",
      "Growth rate - 2.3 % (census 2012-2022)",
      "GDP per capita: 1,040 USD",
      "Literacy rate: 78 percent (2022 survey)",
      "This sentence mentions 2022 but is not a figure line.",
      "Phone: 0788 123 456",
      "Chapter 3: Methods",
    ].join("\n");
    expect(figuresFromText(text)).toEqual([
      { label: "Population", value: 13246394, unit: "people", period_label: "2022", source_url: null },
      { label: "Growth rate", value: 2.3, unit: "%", period_label: "2012-2022", source_url: null },
      { label: "GDP per capita", value: 1040, unit: "USD", period_label: null, source_url: null },
      { label: "Literacy rate", value: 78, unit: "%", period_label: "2022", source_url: null },
    ]);
    expect(figuresFromText("abc: 1\n".repeat(100))).toHaveLength(60);
  });
});

describe("title, summary, body", () => {
  it("renders rows as label: value lines", () => {
    expect(rowsToText(parseDelimited("Indicator,Value,Year\nPopulation,13246394,2022\nGrowth,2.3,"))).toBe("Indicator | Value | Year\nPopulation: Value 13246394, Year 2022\nGrowth: Value 2.3");
    expect(rowsToText([["a", 1], ["b", null]])).toBe("a: 1\nb");
    expect(rowsToText([])).toBe("");
  });
  it("derives the title from the request, the first good line, or the file name", () => {
    expect(deriveTitle("Given", "anything", "f.pdf")).toBe("Given");
    expect(deriveTitle(null, "\n# Rwanda Labour Force Survey 2023.\n\nIntroduction", "f.pdf")).toBe("Rwanda Labour Force Survey 2023");
    expect(deriveTitle(null, "12\n--\nIndicator | Value\nA real heading here", "f.pdf")).toBe("A real heading here");
    expect(deriveTitle(null, "", "labour_force-survey.pdf")).toBe("labour force survey");
    expect(deriveTitle(null, "", "0d6f1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b-labour_force-survey.pdf")).toBe("labour force survey");
    expect(deriveTitle(null, "Indicator | 2021 | Unit\nCoffee exports: 2021 120, Unit million USD", "coffee_exports-2024.csv", true)).toBe("coffee exports 2024");
    expect(deriveTitle(null, "Coffee exports in Rwanda\nIndicator | 2021\nCoffee: 2021 120", "t.csv", true)).toBe("Coffee exports in Rwanda");
    expect(deriveTitle(null, `${"x".repeat(250)}\nShorter line`, "f.pdf")).toBe("Shorter line");
  });
  it("summarizes the first paragraphs within 1000 characters and caps the body", () => {
    const text = `${"A first paragraph about the survey. ".repeat(10)}\n\n${"A second paragraph with results. ".repeat(40)}`;
    const s = deriveSummary(text);
    expect(s.length).toBeLessThanOrEqual(1000);
    expect(s.startsWith("A first paragraph")).toBe(true);
    expect(s.endsWith(".")).toBe(true);
    expect(deriveSummary("tiny")).toBe("tiny");
    expect(deriveBody("x".repeat(60000)).length).toBe(MAX_BODY);
    expect(cleanText("a  \r\nb\r\n\r\n\r\n\r\nc\u0000")).toBe("a\nb\n\nc");
  });
  it("writes the review note and a slug with a suffix", () => {
    expect(reviewNote("census.pdf", new Date("2026-10-02T10:00:00Z"))).toBe("Extracted from census.pdf on 2026-10-02; check the text and figures.");
    expect(draftSlug("Rwanda Labour Force Survey 2023", "AB12cd34")).toBe("rwanda-labour-force-survey-2023-ab12cd34");
    expect(draftSlug("???", "!!")).toBe("item-doc");
  });
});

describe("the model's improvement", () => {
  it("asks for a title, summary and figures from the text only", () => {
    const p = buildImprovePrompt("Population: 13,246,394 (2022)", "Census", [{ label: "Population", value: 13246394, unit: null, period_label: "2022", source_url: null }]);
    expect(p.system).toContain("Never invent");
    expect(p.system).toContain('"figures"');
    expect(p.user).toContain("Working title: Census");
    expect(p.user).toContain("Figures found by a simple scan");
    expect(p.user).toContain("Document:\nPopulation: 13,246,394 (2022)");
    expect(buildImprovePrompt("x".repeat(20000), "T", []).user.length).toBeLessThan(12200);
  });
  it("keeps only figures whose number is in the text", () => {
    const text = "The census counted 13,246,394 people in 2022, a growth of 2.3% a year.";
    const r = parseImprovement('```json\n{"title":" Rwanda census 2022 ","summary":"The 2022 census counted the population.","figures":[{"label":"Population","value":13246394,"unit":"people","period_label":"2022"},{"label":"Growth","value":2.3,"unit":"%"},{"label":"Made up","value":99,"unit":null}]}\n```', text);
    expect(r?.title).toBe("Rwanda census 2022");
    expect(r?.summary).toBe("The 2022 census counted the population.");
    expect(r?.figures).toEqual([
      { label: "Population", value: 13246394, unit: "people", period_label: "2022", source_url: null },
      { label: "Growth", value: 2.3, unit: "%", period_label: null, source_url: null },
    ]);
    expect(parseImprovement("not json", text)).toBeNull();
    expect(parseImprovement(null, text)).toBeNull();
    expect(parseImprovement('{"title": 5}', text)).toEqual({ title: null, summary: null, figures: null });
    expect(numberAppears(4500, "about 4 500 homes")).toBe(true);
    expect(numberAppears(4500, "about 4,500 homes")).toBe(true);
    expect(numberAppears(4500, "about 4500 homes")).toBe(true);
    expect(numberAppears(4500, "about 450 homes")).toBe(false);
  });
});
