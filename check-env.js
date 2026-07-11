import "dotenv/config";
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.log("MISSING");
} else {
  console.log("length:", key.length);
  console.log("starts with:", key.slice(0, 13));
  console.log("ends with:", key.slice(-4));
  console.log("has whitespace:", /\s/.test(key));
}
