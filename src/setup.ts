import { input, confirm } from "@inquirer/prompts";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { ENV_PATH, CONFIG_PATH } from "./paths.js";
import { SlackConfig } from "./types.js";
import { listJoinedChannels } from "./slack.js";

async function promptToken(): Promise<string> {
  console.log("  ┌─ Slack Bot Token needed ───────────────────────────────────┐");
  console.log("  │");
  console.log("  │  1. Go to https://api.slack.com/apps and click");
  console.log("  │     \"Create New App\" → \"From scratch\"");
  console.log("  │");
  console.log("  │  2. Under \"OAuth & Permissions\" → \"Bot Token Scopes\",");
  console.log("  │     add these scopes:");
  console.log("  │     • channels:history   channels:read");
  console.log("  │     • groups:history     groups:read");
  console.log("  │     • users:read");
  console.log("  │");
  console.log("  │  3. Click \"Install to Workspace\" at the top of the page.");
  console.log("  │");
  console.log("  │  4. Copy the \"Bot User OAuth Token\" (starts with xoxb-)");
  console.log("  │     and paste it below.");
  console.log("  │");
  console.log("  └────────────────────────────────────────────────────────────┘\n");

  const token = await input({
    message: "  Slack Bot Token:",
    validate: (v) => v.trim().length > 0 || "Token cannot be empty",
  });

  if (!token.trim().startsWith("xoxb-") && !token.trim().startsWith("xoxp-")) {
    console.error("\n  Error: token should start with xoxb- (bot) or xoxp- (user).");
    process.exit(1);
  }

  process.stdout.write("  Validating...");
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) {
      console.log(" ok\n");
    } else {
      console.log(` failed — ${data.error ?? "invalid token"}\n`);
      const proceed = await confirm({ message: "  Continue anyway?", default: false });
      if (!proceed) process.exit(1);
    }
  } catch {
    console.log(" could not reach Slack API\n");
    const proceed = await confirm({ message: "  Continue anyway?", default: false });
    if (!proceed) process.exit(1);
  }

  return token.trim();
}

export async function main() {
  console.log("\n── Slack Digest Setup ──\n");

  // Token
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
  const existingToken = existing.match(/SLACK_BOT_TOKEN=(.+)/)?.[1] ?? "";

  let token: string;
  if (existingToken) {
    const update = await confirm({ message: "Slack token already set. Update it?", default: false });
    token = update ? await promptToken() : existingToken;
  } else {
    token = await promptToken();
  }

  writeFileSync(ENV_PATH, `SLACK_BOT_TOKEN=${token}\n`, "utf-8");
  console.log(`\nToken saved to ${ENV_PATH}`);

  // Load all channels the bot is a member of — add them all automatically
  console.log("\nFetching channels your bot is a member of...");
  let channels: Array<{ id: string; name: string }> = [];
  try {
    channels = await listJoinedChannels(token);
  } catch (err) {
    console.error(`\nCould not fetch channels: ${(err as Error).message}`);
    console.error("Make sure your token has channels:read and groups:read scopes.");
    process.exit(1);
  }

  if (channels.length === 0) {
    console.log("\nNo channels found. Make sure your bot has been added to at least one channel.");
    process.exit(1);
  }

  const config: SlackConfig = {
    channels,
    defaults: { daysBack: 7 },
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  console.log(`\nAdded ${channels.length} channel(s):`);
  channels.forEach((c) => console.log(`  #${c.name}`));
  console.log("\nSetup complete. Try: sld list --last week\n");
}
