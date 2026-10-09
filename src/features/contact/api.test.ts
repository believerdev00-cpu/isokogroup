// The contact form refuses what the database would refuse, so somebody writing
// in is told what is wrong before they wait for a round trip. The database
// still checks everything itself; these only decide what the person sees first.
import { describe, expect, it } from "vitest";
import { STATUS_LABEL, TOPICS, contactProblem, type ContactInput } from "./api";

const complete: ContactInput = {
  full_name: "Alice Visitor",
  email: "alice@example.com",
  phone: "+250780000000",
  topic: "complaint",
  subject: "My delivery never arrived",
  message: "I ordered on Monday and nothing came.",
};

describe("what the contact form accepts", () => {
  it("accepts a complete message", () => {
    expect(contactProblem(complete)).toBeNull();
  });

  it("does not require a phone number", () => {
    expect(contactProblem({ ...complete, phone: "" })).toBeNull();
    expect(contactProblem({ ...complete, phone: undefined })).toBeNull();
  });

  it("names what is missing, one at a time", () => {
    expect(contactProblem({ ...complete, full_name: "   " })).toMatch(/name/i);
    expect(contactProblem({ ...complete, subject: "   " })).toMatch(/subject/i);
    expect(contactProblem({ ...complete, message: "   " })).toMatch(/message/i);
  });

  it("checks the email looks like one", () => {
    for (const bad of ["alice", "alice@", "@example.com", "alice example.com"]) {
      expect(contactProblem({ ...complete, email: bad })).toMatch(/email/i);
    }
  });

  it("accepts every topic the form offers, and refuses one it does not", () => {
    for (const t of TOPICS) expect(contactProblem({ ...complete, topic: t.key })).toBeNull();
    expect(contactProblem({ ...complete, topic: "spam" })).toMatch(/what your message is about/i);
  });

  it("holds the same lengths the database does", () => {
    // svc_text limits: subject 160, message 5000, phone 40
    expect(contactProblem({ ...complete, message: "x".repeat(5000) })).toBeNull();
    expect(contactProblem({ ...complete, message: "x".repeat(5001) })).toMatch(/too long/i);
    expect(contactProblem({ ...complete, subject: "x".repeat(160) })).toBeNull();
    expect(contactProblem({ ...complete, subject: "x".repeat(161) })).toMatch(/too long/i);
    expect(contactProblem({ ...complete, phone: "9".repeat(40) })).toBeNull();
    expect(contactProblem({ ...complete, phone: "9".repeat(41) })).toMatch(/too long/i);
  });

  it("offers a complaint as a topic, because that is the one people need most", () => {
    expect(TOPICS.map((t) => t.key)).toContain("complaint");
  });

  it("has wording for every status the database allows", () => {
    for (const s of ["new", "read", "replied", "closed"]) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });
});
