// A comment box is the cheapest thing on a site to abuse, so the rules it
// enforces matter more than most. The database enforces them too; these decide
// what somebody is told before they wait for a round trip.
import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_CHARS, MAX_NAME_CHARS, STATUS_LABEL, commentProblem, threaded,
  type CommentInput, type PublicComment,
} from "./api";

const good: CommentInput = {
  subject_type: "research_item",
  subject_id: "6f1d0b7a-1111-4c2a-9a3e-2b0f5c7d8e90",
  display_name: "A Reader",
  email: "reader@example.com",
  body: "This was useful, thank you.",
};

const made = (over: Partial<PublicComment>): PublicComment => ({
  id: "x", subject_type: "research_item", subject_id: "s", parent_id: null,
  display_name: "n", body: "b", author_badge: null, created_at: "2026-10-09T00:00:00Z",
  ...over,
});

describe("what a comment must have", () => {
  it("accepts a complete one", () => {
    expect(commentProblem(good)).toBeNull();
  });

  it("does not require an email", () => {
    expect(commentProblem({ ...good, email: "" })).toBeNull();
    expect(commentProblem({ ...good, email: undefined })).toBeNull();
  });

  it("requires a name to show and something to say", () => {
    expect(commentProblem({ ...good, display_name: "   " })).toMatch(/name/i);
    expect(commentProblem({ ...good, body: "   " })).toMatch(/write your comment/i);
  });

  it("checks an email when one is given", () => {
    expect(commentProblem({ ...good, email: "nope" })).toMatch(/email/i);
  });

  it("holds the same lengths the database does", () => {
    expect(commentProblem({ ...good, body: "x".repeat(MAX_COMMENT_CHARS) })).toBeNull();
    expect(commentProblem({ ...good, body: "x".repeat(MAX_COMMENT_CHARS + 1) })).toMatch(/under/i);
    expect(commentProblem({ ...good, display_name: "x".repeat(MAX_NAME_CHARS) })).toBeNull();
    expect(commentProblem({ ...good, display_name: "x".repeat(MAX_NAME_CHARS + 1) })).toMatch(/too long/i);
  });

  it("has wording for every status the database allows", () => {
    for (const s of ["pending", "approved", "hidden", "removed"]) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });
});

describe("arranging a conversation", () => {
  it("puts each reply under the comment it answers", () => {
    const list = [
      made({ id: "a" }),
      made({ id: "b" }),
      made({ id: "a1", parent_id: "a" }),
      made({ id: "a2", parent_id: "a" }),
    ];
    const out = threaded(list);
    expect(out.map((t) => t.comment.id)).toEqual(["a", "b"]);
    expect(out[0].replies.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(out[1].replies).toHaveLength(0);
  });

  it("never shows a reply as a comment of its own", () => {
    const out = threaded([made({ id: "a" }), made({ id: "a1", parent_id: "a" })]);
    expect(out).toHaveLength(1);
  });

  it("drops a reply whose parent is not there, rather than orphaning it on top", () => {
    // the parent may be unapproved, so the public list simply will not have it
    const out = threaded([made({ id: "orphan", parent_id: "missing" })]);
    expect(out).toHaveLength(0);
  });
});
