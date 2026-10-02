// @vitest-environment node
//
// The pure logic of the research-import Edge Function (the World Bank
// connector): the indicator table, the addresses, reading the API's JSON into
// a yearly series, and the rows written for each item. No network.
//
//   npx vitest run supabase/tests/research-import.test.ts
import { describe, expect, it } from "vitest";
import {
  apiUrl, buildItem, type Country, FIRST_YEAR, importKey, INDICATORS, indicatorSlug, itemSlug, itemTitle, keywordsFor, MAX_CONSECUTIVE_FAILURES,
  mockSeries, pageUrl, parseSeries, SOURCE_NAME, sourceRow, statsRows, TIMEOUT_MS, updateColumns, validateBody,
} from "../functions/research-import/worldbank.ts";

const rwanda: Country = { id: "c-rw", code: "RW", name: "Rwanda", slug: "rwanda" };
const population = INDICATORS[0];
const gdp = INDICATORS.find((i) => i.code === "NY.GDP.MKTP.CD")!;

describe("the indicator table", () => {
  it("lists the fifteen indicators with a unit and a topic each", () => {
    expect(INDICATORS).toHaveLength(15);
    expect(new Set(INDICATORS.map((i) => i.code)).size).toBe(15);
    for (const i of INDICATORS) {
      expect(i.code).toMatch(/^[A-Z]{2}\.[A-Z0-9.]+$/);
      expect(i.title.length).toBeGreaterThan(5);
      expect(["people", "%", "USD", "years"]).toContain(i.unit);
      expect(i.topic).toMatch(/^[a-z]+$/);
    }
    expect(INDICATORS.map((i) => i.topic)).toEqual(["population", "population", "economy", "economy", "economy", "economy", "employment", "tourism", "health", "education", "education", "technology", "infrastructure", "agriculture", "housing"]);
    expect(TIMEOUT_MS).toBe(8000);
    expect(MAX_CONSECUTIVE_FAILURES).toBe(3);
    expect(FIRST_YEAR).toBe(1990);
  });
  it("builds the API and page addresses and the import key", () => {
    expect(apiUrl("SP.POP.TOTL", "RW", 2026)).toBe("https://api.worldbank.org/v2/country/RW/indicator/SP.POP.TOTL?format=json&per_page=100&date=1990:2026");
    expect(pageUrl("SP.POP.TOTL", "RW")).toBe("https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW");
    expect(importKey("RW", "SP.POP.TOTL")).toBe("worldbank:RW:SP.POP.TOTL");
  });
  it("validates the request body", () => {
    expect(validateBody({})).toEqual({ country: null, indicators: INDICATORS });
    expect(validateBody(null)).toEqual({ country: null, indicators: INDICATORS });
    expect(validateBody({ country: "rwanda", indicators: ["SP.POP.TOTL", "NY.GDP.MKTP.CD"] })).toEqual({ country: "rwanda", indicators: [population, gdp] });
    expect(validateBody({ country: "Rwanda" })).toHaveProperty("error");
    expect(validateBody({ indicators: [] })).toHaveProperty("error");
    expect(validateBody({ indicators: ["XX.YY"] })).toHaveProperty("error");
    expect(validateBody({ indicators: "SP.POP.TOTL" })).toHaveProperty("error");
  });
});

describe("reading the World Bank's JSON", () => {
  it("maps rows with a value into a series sorted by year and keeps the update date", () => {
    const json = [
      { page: 1, pages: 1, per_page: 100, total: 4, lastupdated: "2026-07-01" },
      [
        { indicator: { id: "SP.POP.TOTL" }, country: { id: "RW" }, date: "2023", value: 14094683 },
        { date: "2022", value: 13776698 },
        { date: "2021", value: null },
        { date: "2020", value: "13146362" },
        { date: "bad", value: 1 },
      ],
    ];
    expect(parseSeries(json)).toEqual({ points: [{ year: 2020, value: 13146362 }, { year: 2022, value: 13776698 }, { year: 2023, value: 14094683 }], updated: "2026-07-01" });
  });
  it("reports the API's error documents and odd replies", () => {
    expect(parseSeries([{ message: [{ id: "120", key: "Invalid value", value: "The provided parameter value is not valid" }] }])).toEqual({ error: "The provided parameter value is not valid" });
    expect(parseSeries("x")).toEqual({ error: "unexpected reply" });
    expect(parseSeries([])).toEqual({ error: "unexpected reply" });
    expect(parseSeries([{ total: 0 }, null])).toEqual({ points: [], updated: null });
  });
  it("mock series are five fixed years, different per indicator", () => {
    const a = mockSeries("SP.POP.TOTL");
    expect(a.map((p) => p.year)).toEqual([2019, 2020, 2021, 2022, 2023]);
    expect(a).toEqual(mockSeries("SP.POP.TOTL"));
    expect(a).not.toEqual(mockSeries("NY.GDP.MKTP.CD"));
  });
});

describe("what is written", () => {
  const now = new Date("2026-10-02T03:17:00Z");
  const points = [{ year: 2020, value: 13146362 }, { year: 2023, value: 14094683 }];
  it("builds the item row", () => {
    const row = buildItem({ country: rwanda, indicator: population, points, updated: "2026-07-01", topicId: "t-pop", now });
    expect(row).toEqual({
      import_key: "worldbank:RW:SP.POP.TOTL", slug: "rwanda-population-total", kind: "statistic", title: "Population, total — Rwanda",
      summary: "World Bank World Development Indicators for Rwanda: Population, total, 2020–2023. Values as published by the World Bank; last updated by the World Bank on 2026-07-01.",
      country_id: "c-rw", topic_id: "t-pop", origin: "external", source_name: SOURCE_NAME, source_url: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW",
      verification: "unverified", status: "published", import_source: "worldbank", imported_at: "2026-10-02T03:17:00.000Z",
      period_start: "2020-01-01", period_end: "2023-12-31", published_on: "2026-10-02", keywords: ["population", "rwanda"], tags: ["world-bank"], created_by: null,
    });
    expect(indicatorSlug(gdp)).toBe("gdp-current-us");
    expect(itemSlug(rwanda, gdp)).toBe("rwanda-gdp-current-us");
    expect(itemTitle(rwanda, gdp)).toBe("GDP (current US$) — Rwanda");
    expect(keywordsFor(INDICATORS.find((i) => i.code === "IT.NET.USER.ZS")!, rwanda)).toEqual(["individuals", "using", "internet", "population", "rwanda"]);
    const empty = buildItem({ country: rwanda, indicator: population, points: [], updated: null, topicId: null, now });
    expect(empty.summary).toContain("no years with a value yet");
    expect(empty.summary).toContain("retrieved on 2026-10-02");
    expect(empty.period_start).toBeNull();
    expect(empty.period_end).toBeNull();
  });
  it("updates only what the connector owns on a repeat run", () => {
    const row = buildItem({ country: rwanda, indicator: population, points, updated: null, topicId: null, now });
    expect(Object.keys(updateColumns(row, false)).sort()).toEqual(["imported_at", "period_end", "period_start", "summary", "updated_at"]);
    expect(updateColumns(row, true)).toHaveProperty("title", "Population, total — Rwanda");
    expect(updateColumns(row, false)).not.toHaveProperty("status");
    expect(updateColumns(row, false)).not.toHaveProperty("verification");
  });
  it("writes one stat per year with the series code and source address, and one source row", () => {
    expect(statsRows("i1", population, points, rwanda)).toEqual([
      { item_id: "i1", label: "Population, total", value: 13146362, unit: "people", period_label: "2020", period_date: "2020-01-01", series: "SP.POP.TOTL", source_url: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW", sort: 0 },
      { item_id: "i1", label: "Population, total", value: 14094683, unit: "people", period_label: "2023", period_date: "2023-01-01", series: "SP.POP.TOTL", source_url: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW", sort: 1 },
    ]);
    expect(sourceRow("i1", population, rwanda, now)).toEqual({
      item_id: "i1", title: "World Development Indicators", url: "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=RW", publisher: "World Bank",
      source_type: "international_org", retrieved_at: "2026-10-02T03:17:00.000Z", sort: 0,
    });
  });
});
