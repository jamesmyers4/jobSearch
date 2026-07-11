import "dotenv/config";

const OWNER = "jamesmyers4";
const REPO = "resume-vault";

interface TestJob {
  title: string;
  company: string;
  location: string;
  description?: string;
}

async function githubApi(path: string, options: any = {}): Promise<any> {
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.RESUME_VAULT_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options.headers,
      },
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function fetchResumeCorpus(): Promise<string> {
  const files = await githubApi("/contents/resumes");
  const contents = await Promise.all(
    files
      .filter((f: any) => f.type === "file")
      .map(async (f: any) => {
        const file = await githubApi(`/contents/resumes/${f.name}`);
        const decoded = Buffer.from(file.content, "base64").toString("utf-8");
        return `--- ${f.name} ---\n${decoded}`;
      }),
  );
  return contents.join("\n\n");
}

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
  console.log("stop_reason:", data.stop_reason);
  console.log(
    "content block types:",
    data.content?.map((b: any) => b.type),
  );
  const textBlock = data.content?.find((block: any) => block.type === "text");
  return textBlock?.text ?? "";
}

async function draftResume(
  job: TestJob,
  resumeCorpus: string,
): Promise<{ draft: string; flags: string[] }> {
  const jobInfo = `Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}${job.description ? `\nDescription: ${job.description}` : ""}`;
  const system = `You are drafting a tailored V1 resume for this candidate, based on their past resumes below. Write a complete, ATS-friendly resume in markdown tailored to the job posting. Keep it to roughly two pages of content. Use only claims supported by the candidate's past resumes below, do not invent employers, dates, titles, or metrics that do not appear in them. After the resume, add a line containing exactly ---FLAGS--- followed by a bullet list of anything you were not fully confident stating, such as a skill depth claim, a years-of-experience number, or a tool you are inferring rather than confirming, each with a one-line reason.\n\nCandidate's past resumes:\n${resumeCorpus}`;
  const text = await callClaude("claude-sonnet-5", system, jobInfo, 4000);
  const [draft, flagsText] = text.split("---FLAGS---");
  const flags = (flagsText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { draft: (draft ?? "").trim(), flags };
}

const testJob: TestJob = {
  title: "QA Automation Engineer",
  company: "HealthTech Co",
  location: "Remote - US",
  description:
    "We are looking for a QA Automation Engineer to build and maintain our Playwright/TypeScript test suite, integrate testing into our GitHub Actions CI/CD pipeline, and help scale our automated regression coverage across a growing healthcare SaaS platform.",
};

async function main() {
  console.log("Fetching resume corpus...");
  const corpus = await fetchResumeCorpus();
  console.log(`Corpus loaded, ${corpus.length} chars`);
  console.log("Drafting resume...");
  const result = await draftResume(testJob, corpus);
  console.log("DRAFT:");
  console.log(result.draft);
  console.log("FLAGS:");
  console.log(result.flags.join("\n"));
}

main().catch((err) => console.error("Test failed:", err));
