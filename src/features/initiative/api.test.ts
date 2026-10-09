// What an applicant's own file may be, and what the website is allowed to read
// back about their application. Both rules are also enforced by the database and
// the storage bucket; these guard the website's half so the two cannot drift.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Records what each query asks the database for. Checking the constant alone
// would not notice a query that went back to asking for every column, so the
// call itself is what these tests watch.
const selected: string[] = [];
const chain: Record<string, unknown> = {};
Object.assign(chain, {
  select: (columns: string) => { selected.push(columns); return chain; },
  eq: () => chain,
  insert: () => chain,
  order: () => Promise.resolve({ data: [], error: null }),
  single: () => Promise.resolve({ data: {}, error: null }),
});

vi.mock("@/features/services/api", () => ({
  db: { from: () => chain },
  unwrap: (res: { data: unknown; error: { message: string } | null }) => {
    if (res?.error) throw new Error(res.error.message);
    return res?.data;
  },
  errorText: (e: unknown) => (e instanceof Error ? e.message : "error"),
}));
// No real client, and no storage call: these tests never leave the process.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() }) } },
}));

import {
  DOCUMENT_EXTENSIONS, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, OWN_COLUMNS, OWN_DONATION_COLUMNS,
  submitApplication, submitDonation, useMyApplications, useMyDonations,
} from "./api";

describe("supporting documents", () => {
  it("accepts only the four kinds the bucket accepts", () => {
    expect(DOCUMENT_TYPES.sort()).toEqual(
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].sort(),
    );
  });

  it("names the stored file from its kind, never from the name the visitor gave it", () => {
    expect(DOCUMENT_EXTENSIONS["application/pdf"]).toBe("pdf");
    expect(DOCUMENT_EXTENSIONS["image/jpeg"]).toBe("jpg");
    expect(DOCUMENT_EXTENSIONS["image/png"]).toBe("png");
    expect(DOCUMENT_EXTENSIONS["image/webp"]).toBe("webp");
    // a crafted filename has no extension to contribute
    expect(DOCUMENT_EXTENSIONS["application/x-msdownload"]).toBeUndefined();
    expect(DOCUMENT_EXTENSIONS["text/html"]).toBeUndefined();
  });

  it("every allowed kind has an extension, and every extension is plain", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_EXTENSIONS[type], type).toMatch(/^[a-z0-9]{2,5}$/);
    }
  });

  it("agrees with the bucket's size limit", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("what a donor reads back about their own contribution", () => {
  const columns = OWN_DONATION_COLUMNS.split(",").map((c) => c.trim());

  it("never asks for the reviewing admin or the donor account id", () => {
    // reviewed_by is the admin who checked the statement, which is no part of
    // telling a donor whether their payment was found.
    for (const forbidden of ["reviewed_by", "user_id"]) {
      expect(columns, forbidden).not.toContain(forbidden);
    }
  });

  it("does ask for what the donor needs to see", () => {
    for (const needed of ["amount", "status", "reference", "submitted_at", "review_note"]) {
      expect(columns, needed).toContain(needed);
    }
  });

  it("is a column list, not a wildcard", () => {
    expect(OWN_DONATION_COLUMNS).not.toContain("*");
  });
});

describe("what an applicant reads back about their own application", () => {
  // The real constant the query uses, so this cannot pass while the query drifts.
  const columns = OWN_COLUMNS.split(",").map((c) => c.trim());

  it("never asks for a reviewer's identity, the stored file, or an account id", () => {
    for (const forbidden of ["reviewed_by", "verified_by", "document_path", "user_id"]) {
      expect(columns, forbidden).not.toContain(forbidden);
    }
  });

  it("is a column list, not a wildcard", () => {
    expect(OWN_COLUMNS).not.toContain("*");
    expect(columns).toEqual([
      "id", "title", "description", "focus_area", "subcategory", "item", "location",
      "amount_required", "status", "published", "rejection_reason", "completion_summary",
      "completed_at", "created_at", "updated_at",
    ]);
  });
});

/**
 * The two places an applicant's own row is read. Each asserts the argument the
 * query actually passed, so putting "*" back in either one fails here even
 * though the constant above would still be correct.
 */
describe("the queries an applicant's own row goes through", () => {
  beforeEach(() => { selected.length = 0; });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      children,
    );

  it("useMyApplications asks for the named columns, never every column", async () => {
    renderHook(() => useMyApplications("11111111-1111-1111-1111-111111111111"), { wrapper });
    await waitFor(() => expect(selected.length).toBeGreaterThan(0));
    expect(selected).toContain(OWN_COLUMNS);
    expect(selected).not.toContain("*");
  });

  it("submitApplication asks for the named columns, never every column", async () => {
    await submitApplication("11111111-1111-1111-1111-111111111111", {
      title: "Coding bootcamp",
      description: "A description that is comfortably longer than forty characters.",
      focus_area: "unemployment_reduction",
      subcategory: "technical_upskilling",
      item: "coding",
      location: "Kigali",
      amount_required: 500000,
    });
    expect(selected).toEqual([OWN_COLUMNS]);
    expect(selected).not.toContain("*");
  });

  it("useMyDonations asks for the named columns, never every column", async () => {
    renderHook(() => useMyDonations("11111111-1111-1111-1111-111111111111"), { wrapper });
    await waitFor(() => expect(selected.length).toBeGreaterThan(0));
    expect(selected).toContain(OWN_DONATION_COLUMNS);
    expect(selected).not.toContain("*");
  });

  it("submitDonation asks for the named columns, never every column", async () => {
    await submitDonation({
      amount: 5000,
      payment_method: "momo",
      reference: "TX12345",
      project_id: null,
      donor_name: "A Donor",
      donor_email: "donor@example.com",
      anonymous: false,
    });
    expect(selected).toEqual([OWN_DONATION_COLUMNS]);
    expect(selected).not.toContain("*");
  });

  it("neither query can return a reviewer, a stored file, or an account id", async () => {
    renderHook(() => useMyApplications("11111111-1111-1111-1111-111111111111"), { wrapper });
    await waitFor(() => expect(selected.length).toBeGreaterThan(0));
    await submitApplication("11111111-1111-1111-1111-111111111111", {
      title: "Coding bootcamp",
      description: "A description that is comfortably longer than forty characters.",
      focus_area: "arts", subcategory: "music", item: null,
      location: "Kigali", amount_required: 1000,
    });
    for (const asked of selected) {
      expect(asked).not.toBe("*");
      for (const forbidden of ["user_id", "document_path", "reviewed_by", "verified_by"]) {
        expect(asked, `${forbidden} in "${asked}"`).not.toContain(forbidden);
      }
    }
  });
});
