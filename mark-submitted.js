import { readFileSync, writeFileSync } from "fs";
const path = "application-tracker.json";
const query = process.argv.slice(2).join(" ").toLowerCase();
if (!query) {
  console.log("Usage: node mark-submitted.js <title or company keyword>");
  process.exit(1);
}
let tracker;
try {
  tracker = JSON.parse(readFileSync(path, "utf-8"));
} catch {
  console.log(
    "No application-tracker.json yet — it's created automatically the first time a real alert email goes out.",
  );
  process.exit(0);
}
const matches = Object.entries(tracker).filter(
  ([, entry]) =>
    !entry.submittedAt &&
    `${entry.title} ${entry.company ?? ""}`.toLowerCase().includes(query),
);
if (matches.length === 0) {
  console.log("No unsubmitted match found for:", query);
} else if (matches.length > 1) {
  console.log("Multiple matches, be more specific:");
  for (const [key, entry] of matches) {
    console.log(`  ${key} — ${entry.title} @ ${entry.company ?? "unknown"}`);
  }
} else {
  const [, entry] = matches[0];
  const now = new Date();
  entry.submittedAt = now.toISOString();
  const alertedHours = (
    (now.getTime() - new Date(entry.alertedAt).getTime()) /
    3600000
  ).toFixed(1);
  console.log(
    `Marked submitted: ${entry.title} @ ${entry.company ?? "unknown"}`,
  );
  console.log(`Turnaround from alert to submission: ${alertedHours} hours`);
  if (entry.postedAt) {
    const postedDays = (
      (now.getTime() - new Date(entry.postedAt).getTime()) /
      86400000
    ).toFixed(1);
    console.log(`Turnaround from posting to submission: ${postedDays} days`);
  }
  writeFileSync(path, JSON.stringify(tracker, null, 2));
}
