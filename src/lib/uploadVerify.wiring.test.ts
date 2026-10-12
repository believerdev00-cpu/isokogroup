import { beforeEach, describe, expect, it, vi } from "vitest";

// One storage stand-in for every module under test: they all reach the same
// client, so a single mock proves each of them actually asks it what landed.
const upload = vi.hoisted(() => vi.fn());
const info = vi.hoisted(() => vi.fn());
const inserted = vi.hoisted(() => [] as unknown[]);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ upload, info, getPublicUrl: () => ({ data: { publicUrl: "https://example.test/x" } }) }) },
    from: () => ({ insert: (row: unknown) => (inserted.push(row), Promise.resolve({ data: null, error: null })) }),
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "t" } } }) },
    functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
  },
}));

import { uploadLibraryFile } from "./libraryFiles";
import { uploadArtwork } from "@/features/adverts/api";
import { uploadStaffFile } from "@/features/services/api";

/** A File of a given size without putting the bytes in memory. */
const sized = (bytes: number, name = "doc.pdf", type = "application/pdf") => {
  const f = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(f, "size", { value: bytes });
  return f;
};

const arrives = (bytes: number) => info.mockResolvedValue({ data: { size: bytes }, error: null });

// The 24-byte film was one upload path. These are the others: every one of
// them hands a path to something that stores it and shows it later, and none
// of them used to count what arrived.
describe("every upload path confirms what landed", () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({ data: { path: "p" }, error: null });
    info.mockReset();
    inserted.length = 0;
  });

  describe("a book or a film in the subscriber library", () => {
    it("returns the path when the whole file arrived", async () => {
      arrives(2048);
      await expect(uploadLibraryFile("books", "content", sized(2048))).resolves.toMatch(/^content\//);
    });

    it("refuses a book that arrived short, so no row points at it", async () => {
      arrives(24);
      await expect(uploadLibraryFile("books", "content", sized(2048))).rejects.toThrow(/stopped early/);
    });

    it("refuses one that left nothing behind", async () => {
      info.mockResolvedValue({ data: null, error: { statusCode: "404", message: "Object not found" } });
      await expect(uploadLibraryFile("books", "content", sized(2048))).rejects.toThrow(/did not finish/);
    });
  });

  describe("advert artwork", () => {
    const art = () => sized(1024, "art.png", "image/png");

    it("returns the path when the whole file arrived", async () => {
      arrives(1024);
      await expect(uploadArtwork("user-1", art())).resolves.toMatch(/^user-1\//);
    });

    // The submit function is handed a path and cannot tell whole from short.
    it("refuses artwork that arrived short", async () => {
      arrives(24);
      await expect(uploadArtwork("user-1", art())).rejects.toThrow(/stopped early/);
    });
  });

  describe("a staff working file on a service request", () => {
    it("returns the path when the whole file arrived", async () => {
      arrives(4096);
      await expect(uploadStaffFile("travel", "req-1", sized(4096))).resolves.toMatch(/^travel\/internal\/req-1\//);
    });

    // This one gets shared with the customer as a deliverable.
    it("refuses a file that arrived short", async () => {
      arrives(1);
      await expect(uploadStaffFile("travel", "req-1", sized(4096))).rejects.toThrow(/stopped early/);
    });
  });

  it("asks storage on every path, never taking the upload's word for it", async () => {
    arrives(512);
    await uploadLibraryFile("books", "content", sized(512));
    await uploadArtwork("user-1", sized(512, "art.png", "image/png"));
    await uploadStaffFile("travel", "req-1", sized(512));
    expect(info).toHaveBeenCalledTimes(3);
  });
});
