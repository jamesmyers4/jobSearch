import "dotenv/config";

interface TestJob {
  title: string;
  company: string;
  location: string;
  description?: string;
}

const CANDIDATE_PROFILE = `James Myers is a QA Automation Engineer / SDET with 22 years of enterprise software experience, including about 5 years focused specifically on test automation. Core stack: Playwright/TypeScript, Selenium, REST API testing, GitHub Actions CI/CD, and a custom-built agentic AI test framework using the Anthropic API. Based in Knoxville, TN, targeting fully remote roles. Interested in hands-on software test automation roles: SDET, QA Automation Engineer, Test Automation Engineer, Automation Architect, and similar. Not a fit for manual-only QA roles, manufacturing/hardware/food-safety quality control roles, or roles with a hard requirement for a formal CS degree (self-taught, no degree).`;

async function callClaude(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `Anthropic API ${response.status}: ${JSON.stringify(data)}`,
    );
  }
  return data.content?.[0]?.text ?? "";
}

async function prefilterJob(
  job: TestJob,
): Promise<{ isMatch: boolean; reason: string }> {
  const jobInfo = `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}${job.description ? `\nDescription: ${job.description.slice(0, 1000)}` : ""}`;
  const text = await callClaude(
    "claude-haiku-4-5-20251001",
    `You are screening job postings for this candidate:\n${CANDIDATE_PROFILE}\nRespond with exactly one line in this format: YES|reason or NO|reason, where reason is under 12 words.`,
    jobInfo,
    60,
  );
  const [verdict, reason] = text.trim().split("|");
  return {
    isMatch: verdict?.trim().toUpperCase() === "YES",
    reason: reason?.trim() ?? "",
  };
}

const testJobs: TestJob[] = [
  { title: "SDET", company: "Acme Software", location: "Remote - US" },
  {
    title: "Quality Engineer",
    company: "Acme Manufacturing",
    location: "Detroit, MI",
  },
  {
    title: "QA Automation Engineer",
    company: "HealthTech Co",
    location: "Remote",
  },
  {
    title: "Senior QA Engineer",
    company: "Big Bank Corp",
    location: "New York, NY",
    description:
      "Requires PhD in Computer Science and 15 years managing offshore manual QA teams.",
  },
  {
    title: "Software Development Engineer in Test",
    company: "CloudCo",
    location: "Remote - US",
  },
];

async function main() {
  for (const job of testJobs) {
    const result = await prefilterJob(job);
    console.log(
      `${job.title} @ ${job.company} -> ${result.isMatch ? "MATCH" : "SKIP"} (${result.reason})`,
    );
  }
}

main();
