import "dotenv/config";

const OWNER = "jamesmyers4";
const REPO = "resume-vault";

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

async function testReadResumes() {
  const files = await githubApi("/contents/resumes");
  console.log(
    "Files found in /resumes:",
    files.map((f: any) => f.name),
  );
  const first = files.find((f: any) => f.type === "file");
  if (!first) {
    console.log("No files found to test-read");
    return;
  }
  const file = await githubApi(`/contents/resumes/${first.name}`);
  const decoded = Buffer.from(file.content, "base64").toString("utf-8");
  console.log(`First 200 chars of ${first.name}:`);
  console.log(decoded.slice(0, 200));
}

async function testWriteDraft() {
  const content = `Test draft written ${new Date().toISOString()}`;
  await githubApi("/contents/drafts/test-write.md", {
    method: "PUT",
    body: JSON.stringify({
      message: "Test write from pipeline setup",
      content: Buffer.from(content).toString("base64"),
    }),
  });
  console.log("Successfully wrote drafts/test-write.md");
}

async function main() {
  console.log("Testing read access...");
  await testReadResumes();
  console.log("Testing write access...");
  await testWriteDraft();
  console.log("All tests passed");
}

main().catch((err) => console.error("Test failed:", err));
