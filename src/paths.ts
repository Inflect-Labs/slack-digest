import { homedir } from "os";
import { join } from "path";

const BASE = join(homedir(), ".slack-digest");
export const CONFIG_PATH = join(BASE, "digest.config.json");
export const ENV_PATH = join(BASE, ".env");
