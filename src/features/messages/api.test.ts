// The database decides who may read a conversation; nothing here does. These
// cover the small amount of judgement the browser is allowed to make: what
// counts as a sendable message, and what the unread badge should say.
import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_CHARS, messageProblem, totalUnread, type Conversation } from "./api";

const conv = (over: Partial<Conversation>): Conversation => ({
  id: "c", subject: "s", about_product_id: null, last_message_at: "2026-10-09T00:00:00Z",
  unread: 0, last_body: null, last_sender_id: null, other_names: null, ...over,
});

describe("what can be sent", () => {
  it("accepts an ordinary message", () => {
    expect(messageProblem("Hello, is this still available?")).toBeNull();
  });

  it("refuses an empty one, including whitespace only", () => {
    for (const bad of ["", "   ", "\n\n", "\t"]) {
      expect(messageProblem(bad)).toMatch(/write something/i);
    }
  });

  it("holds the same length the database does", () => {
    expect(messageProblem("x".repeat(MAX_MESSAGE_CHARS))).toBeNull();
    expect(messageProblem("x".repeat(MAX_MESSAGE_CHARS + 1))).toMatch(/under/i);
    expect(MAX_MESSAGE_CHARS).toBe(5000);
  });

  it("measures the trimmed message, not the padding around it", () => {
    expect(messageProblem("   hello   ")).toBeNull();
    expect(messageProblem("  " + "x".repeat(MAX_MESSAGE_CHARS) + "  ")).toBeNull();
  });
});

describe("the unread badge", () => {
  it("adds up across conversations", () => {
    expect(totalUnread([conv({ unread: 2 }), conv({ unread: 3 }), conv({ unread: 0 })])).toBe(5);
  });

  it("is zero when there is nothing, and survives an empty inbox", () => {
    expect(totalUnread([])).toBe(0);
    expect(totalUnread(undefined)).toBe(0);
    expect(totalUnread([conv({ unread: 0 })])).toBe(0);
  });

  it("does not trip over a missing count", () => {
    expect(totalUnread([conv({ unread: undefined as unknown as number }), conv({ unread: 4 })])).toBe(4);
  });
});
