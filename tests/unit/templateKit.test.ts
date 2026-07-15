import { describe, it, expect } from "vitest";
import {
  significantWords,
  extractUnconfirmedTerms,
  buildCoverLetter,
  buildTemplateDraft,
  type JobPosting,
} from "../../check-jobs.ts";

function makeJob(overrides: Partial<JobPosting>): JobPosting {
  return { key: "wk:1", title: "QA Engineer", url: "https://example.com/1", ...overrides };
}

describe("significantWords", () => {
  it("drops stop words and short words, keeps meaningful technical terms", () => {
    const text = "Experience with Playwright, TypeScript, and CI/CD pipelines using C++ or automation.";
    expect(significantWords(text)).toEqual(
      new Set(["playwright", "typescript", "ci", "cd", "pipelines", "c++", "automation"]),
    );
  });

  it("keeps 2-letter terms that are on the short allowlist (ai, js, ts, db, ui, ux, ci, cd, r2)", () => {
    expect(significantWords("AI JS TS DB UI UX CI CD R2")).toEqual(
      new Set(["ai", "js", "ts", "db", "ui", "ux", "ci", "cd", "r2"]),
    );
  });

  it("drops a 2-letter term not on the short allowlist, even one as recognizable as 'C#'", () => {
    // A real quirk: significantWords' length filter (w.length > 2) excludes
    // "c#" since it's only 2 characters and not in the short allowlist, so
    // this specific skill token never survives into the matching engine.
    const words = significantWords("Experience with C# and ASP.NET.");
    expect(words.has("c#")).toBe(false);
  });

  it("is case-insensitive and strips punctuation other than # and +", () => {
    expect(significantWords("SQL, SQL. sql!")).toEqual(new Set(["sql"]));
  });
});

describe("extractUnconfirmedTerms", () => {
  const contextMd = `# Resume Framing Context

## Master Skill Inventory

### Confirmed
Extensive hands-on production experience with Playwright, TypeScript, Selenium, and GitHub Actions.

### Unconfirmed
Some exposure to Kubernetes, Kafka, and Terraform, but not confirmed production experience.

## Unrelated Section

Docker and Ansible are mentioned here but outside the Master Skill Inventory section entirely.
`;

  it("returns technical terms that appear only in the Unconfirmed subsection, not the Confirmed one", () => {
    const terms = extractUnconfirmedTerms(contextMd);
    expect(terms.has("kubernetes")).toBe(true);
    expect(terms.has("kafka")).toBe(true);
    expect(terms.has("terraform")).toBe(true);
  });

  it("excludes confirmed terms even though they're technical", () => {
    const terms = extractUnconfirmedTerms(contextMd);
    expect(terms.has("playwright")).toBe(false);
    expect(terms.has("typescript")).toBe(false);
    expect(terms.has("selenium")).toBe(false);
  });

  it("ignores content outside the Master Skill Inventory section entirely", () => {
    const terms = extractUnconfirmedTerms(contextMd);
    expect(terms.has("docker")).toBe(false);
    expect(terms.has("ansible")).toBe(false);
  });

  it("does not include the literal word 'unconfirmed' from the section's own heading", () => {
    const terms = extractUnconfirmedTerms(contextMd);
    expect(terms.has("unconfirmed")).toBe(false);
  });

  it("returns an empty set when there's no Master Skill Inventory section at all", () => {
    expect(extractUnconfirmedTerms("# Just some unrelated markdown\n\nNothing relevant here.")).toEqual(new Set());
  });
});

describe("buildCoverLetter", () => {
  it("includes the company name, job title, and up to 3 matched terms", () => {
    const job = makeJob({ title: "Senior SDET", company: "Acme Health" });
    const letter = buildCoverLetter(job, ["playwright", "typescript", "selenium", "sql"]);
    expect(letter).toContain("Acme Health");
    expect(letter).toContain("Senior SDET");
    expect(letter).toContain("playwright, typescript, selenium");
    expect(letter).not.toContain("sql");
  });

  it("falls back to a generic skills phrase when there are no matched terms", () => {
    const job = makeJob({ title: "SDET", company: "Acme" });
    const letter = buildCoverLetter(job, []);
    expect(letter).toContain("test automation and QA engineering");
  });

  it("falls back to 'the team' when company is absent", () => {
    const job = makeJob({ title: "SDET", company: undefined });
    const letter = buildCoverLetter(job, []);
    expect(letter).toContain("Dear Hiring Team at the team,");
  });
});

describe("buildTemplateDraft", () => {
  const contextMd = `## Master Skill Inventory

### Confirmed
Playwright, TypeScript, Selenium, REST API testing.

### Unconfirmed
Kubernetes exposure, but not confirmed production experience.
`;

  it("returns undefined when no resumes are available", () => {
    const job = makeJob({ title: "SDET", description: "Playwright testing role." });
    expect(buildTemplateDraft(job, new Map(), contextMd)).toBeUndefined();
  });

  it("picks the resume with the strongest keyword overlap and surfaces the matched terms", () => {
    const resumes = new Map([
      [
        "automation-resume.md",
        "Extensive experience with Playwright and TypeScript for end to end test automation, plus REST API testing.",
      ],
      [
        "backend-resume.md",
        "Backend engineer with Java Spring Boot and AWS experience.",
      ],
    ]);
    const job = makeJob({
      title: "QA Automation Engineer",
      description: "We need a QA Automation Engineer skilled in Playwright and TypeScript for REST API test automation.",
    });
    const draft = buildTemplateDraft(job, resumes, contextMd);
    expect(draft).toContain("Resume selected: **automation-resume.md**");
    expect(draft).toMatch(/matched on:.*playwright/i);
    expect(draft).toContain("Cover Letter (draft)");
  });

  it("flags a skill gap when the job description mentions an Unconfirmed-list term", () => {
    const resumes = new Map([["resume.md", "Playwright and TypeScript automation experience."]]);
    const job = makeJob({
      title: "QA Automation Engineer",
      description: "Playwright automation role, some Kubernetes exposure preferred.",
    });
    const draft = buildTemplateDraft(job, resumes, contextMd);
    expect(draft).toContain("Possible skill gaps flagged");
    expect(draft).toContain("kubernetes");
  });

  it("shows no flagged gaps when nothing in the job description matches the Unconfirmed list", () => {
    const resumes = new Map([["resume.md", "Playwright and TypeScript automation experience."]]);
    const job = makeJob({
      title: "QA Automation Engineer",
      description: "Playwright automation role.",
    });
    const draft = buildTemplateDraft(job, resumes, contextMd);
    expect(draft).toContain("No flagged gaps against the Unconfirmed skill list.");
  });

  it("shows the 'no strong signal found' fallback note when the job shares no significant words with any resume", () => {
    // This is the exact roadmap item flagged in TESTING.md's email-layer
    // section as still needing coverage — the case where bestMatched ends up
    // empty because nothing in the job posting overlaps any resume at all.
    const resumes = new Map([
      ["automation-resume.md", "Playwright and TypeScript automation experience."],
    ]);
    const job = makeJob({
      title: "Executive Assistant",
      description: "General administrative support role for a small office.",
    });
    const draft = buildTemplateDraft(job, resumes, contextMd);
    expect(draft).toContain(
      "Note: matched broadly on skills shared across all resume variants — nothing stood out as strongly distinguishing for this specific posting.",
    );
  });
});
