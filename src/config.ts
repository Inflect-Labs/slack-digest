import { readFileSync, writeFileSync } from "fs";
import { SlackConfig, ChannelConfig } from "./types.js";
import { CONFIG_PATH } from "./paths.js";

export function loadConfig(): SlackConfig {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf-8");
  } catch {
    console.error(`Error: No config found at ${CONFIG_PATH}`);
    console.error(`Run 'sld setup' to get started.`);
    process.exit(1);
  }

  let config: SlackConfig;
  try {
    config = JSON.parse(raw);
  } catch {
    console.error(`Error: config.json is not valid JSON.`);
    process.exit(1);
  }

  if (!config.channels || config.channels.length === 0) {
    console.error(`Error: No channels configured. Run 'sld channels add'.`);
    process.exit(1);
  }

  return config;
}

export function saveConfig(config: SlackConfig): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function filterByChannel(channels: ChannelConfig[], arg: string): ChannelConfig[] {
  const lower = arg.toLowerCase().replace(/^#/, "");
  const filtered = channels.filter(
    (c) => c.name.toLowerCase() === lower || c.id.toLowerCase() === lower
  );
  if (filtered.length === 0) {
    console.error(`Error: no configured channel matches "${arg}".`);
    console.error(`Configured: ${channels.map((c) => `#${c.name}`).join(", ")}`);
    process.exit(1);
  }
  return filtered;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Error: Missing required environment variable ${name}.`);
    console.error(`  Run 'sld setup' to configure your Slack bot token.`);
    process.exit(1);
  }
  return value;
}

const LAST_PERIODS: Record<string, number> = {
  day: 1, "1d": 1,
  "3d": 3, "3days": 3,
  week: 7, "1w": 7,
  "2w": 14, fortnight: 14,
  month: 30, "30d": 30,
};

export function parseLast(last: string): number {
  const key = last.toLowerCase().replace(/\s+/g, "");
  if (LAST_PERIODS[key] !== undefined) return LAST_PERIODS[key];
  const match = key.match(/^(\d+)d(ays?)?$/);
  if (match) return parseInt(match[1], 10);
  console.error(`Error: unrecognised --last value "${last}".`);
  console.error(`  Supported: day, 3d, week, fortnight, month, or Nd (e.g. 5d)`);
  process.exit(1);
}

export function getDateRange(
  sinceArg: string | undefined,
  untilArg: string | undefined,
  daysBack: number
): { since: string; until: string } {
  const until = untilArg ?? new Date().toISOString().split("T")[0];
  let since: string;
  if (sinceArg) {
    since = sinceArg;
  } else {
    const d = new Date(until);
    d.setDate(d.getDate() - daysBack);
    since = d.toISOString().split("T")[0];
  }
  return { since, until };
}

export function toUnixTimestamp(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}
