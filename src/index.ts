import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { Command } from "commander";
import { ENV_PATH } from "./paths.js";
import {
  loadConfig, saveConfig, filterByChannel, requireEnv,
  getDateRange, parseLast, toUnixTimestamp,
} from "./config.js";
import { fetchChannelMessages } from "./slack.js";

loadEnv({ path: ENV_PATH });

const __dirname = dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
) as { version: string };

const program = new Command();

program
  .name("sld")
  .description("Fetch and display Slack channel messages by time range")
  .version(version);

// ─── sld setup ───────────────────────────────────────────────────────────────
program
  .command("setup")
  .description("Interactive setup — configure bot token and channels")
  .action(async () => {
    const { main } = await import("./setup.js");
    await main();
  });

// ─── sld channels ────────────────────────────────────────────────────────────
const channelsCmd = program
  .command("channels")
  .description("View and manage configured channels");

channelsCmd
  .command("list", { isDefault: true })
  .description("Show all configured channels")
  .action(() => {
    const config = loadConfig();
    console.log(`\nConfigured channels (${config.channels.length}):\n`);
    config.channels.forEach((c, i) => {
      console.log(`  ${i + 1}. #${c.name}  (${c.id})`);
    });
    console.log("");
  });

channelsCmd
  .command("add")
  .description("Add channels interactively from the bot's joined channels")
  .action(async () => {
    const { listJoinedChannels } = await import("./slack.js");
    const { checkbox } = await import("@inquirer/prompts");
    loadEnv({ path: ENV_PATH });
    const token = requireEnv("SLACK_BOT_TOKEN");
    const config = loadConfig();

    const available = await listJoinedChannels(token);
    const existing = new Set(config.channels.map((c) => c.id));
    const choices = available
      .filter((c) => !existing.has(c.id))
      .map((c) => ({ name: `#${c.name}`, value: c }));

    if (choices.length === 0) {
      console.log("No new channels to add.");
      return;
    }

    const selected = await checkbox({ message: "Select channels to add:", choices });
    config.channels.push(...selected);
    saveConfig(config);
    console.log(`\nAdded: ${selected.map((c) => `#${c.name}`).join(", ")}\n`);
  });

channelsCmd
  .command("remove")
  .description("Remove configured channels")
  .action(async () => {
    const { checkbox } = await import("@inquirer/prompts");
    const config = loadConfig();

    const toRemove = await checkbox({
      message: "Select channels to remove:",
      choices: config.channels.map((c) => ({ name: `#${c.name}`, value: c.id })),
    });

    config.channels = config.channels.filter((c) => !toRemove.includes(c.id));
    saveConfig(config);
    console.log(`\nRemoved ${toRemove.length} channel(s). Remaining: ${config.channels.length}\n`);
  });

// ─── sld list ────────────────────────────────────────────────────────────────
program
  .command("list")
  .description("Show messages from configured channels for a time range")
  .option("--since <date>", "Start date (YYYY-MM-DD)")
  .option("--until <date>", "End date (YYYY-MM-DD)")
  .option("--last <period>", "Shorthand period: day, 3d, week, fortnight, month")
  .option("--channel <name>", "Filter to a single channel (e.g. general or #general)")
  .option("--no-copy", "Print only, do not copy to clipboard")
  .action(async (opts: {
    since?: string; until?: string; last?: string;
    channel?: string; copy: boolean;
  }) => {
    const config = loadConfig();
    const token = requireEnv("SLACK_BOT_TOKEN");

    const channels = opts.channel
      ? filterByChannel(config.channels, opts.channel)
      : config.channels;

    const daysBack = opts.last ? parseLast(opts.last) : config.defaults.daysBack;
    const { since, until } = getDateRange(opts.since, opts.until, daysBack);
    const oldest = toUnixTimestamp(since);
    const latest = toUnixTimestamp(until) + 86400; // include full end day

    process.stderr.write(`\nFetching messages — ${since} to ${until}\n\n`);

    const lines: string[] = [];
    let totalMessages = 0;

    for (const channel of channels) {
      const digest = await fetchChannelMessages(channel, oldest, latest, token);
      totalMessages += digest.messages.length;

      const header = `#${channel.name}`;
      lines.push(`\n${"─".repeat(header.length)}`);
      lines.push(header);
      lines.push(`${"─".repeat(header.length)}`);

      if (digest.messages.length === 0) {
        lines.push("  No messages in this period.\n");
        continue;
      }

      for (const msg of digest.messages) {
        const date = new Date(parseFloat(msg.ts) * 1000).toISOString().split("T")[0];
        lines.push(`\n  [${date}] ${msg.username}`);
        msg.text.split(/\r?\n/).forEach((line) => lines.push(`  ${line}`));
        if (msg.replyCount && msg.replyCount > 0) {
          lines.push(`  ↳ ${msg.replyCount} repl${msg.replyCount === 1 ? "y" : "ies"}`);
        }
      }
    }

    lines.push(`\n${"─".repeat(40)}`);
    lines.push(
      `Total: ${totalMessages} message${totalMessages !== 1 ? "s" : ""} across ${channels.length} channel${channels.length !== 1 ? "s" : ""}`
    );

    const output = lines.join("\n");
    console.log(output);
  });

program.parse(process.argv);
