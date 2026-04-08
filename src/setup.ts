import { input } from "@inquirer/prompts";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { ENV_PATH, CONFIG_PATH } from "./paths.js";
import { SlackConfig } from "./types.js";
import { listJoinedChannels } from "./slack.js";

export async function main() {
  console.log("\n── Slack Digest Setup ──\n");

  // Token
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf-8") : "";
  const existingToken = existing.match(/SLACK_BOT_TOKEN=(.+)/)?.[1] ?? "";

  const token = await input({
    message: "Slack Bot Token (xoxb-...):",
    default: existingToken || undefined,
  });

  if (!token.startsWith("xoxb-") && !token.startsWith("xoxp-")) {
    console.error("Error: token should start with xoxb- (bot) or xoxp- (user).");
    process.exit(1);
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
