import { ChannelConfig, ChannelDigest, SlackMessage } from "./types.js";

const BASE_URL = "https://slack.com/api";

async function slackGet(endpoint: string, params: Record<string, string>, token: string): Promise<unknown> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Slack API error ${res.status}: ${res.statusText}`);
  }

  const data = await res.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return data;
}

interface UserInfo {
  user?: { real_name?: string; name?: string };
}

async function resolveUsername(userId: string, token: string): Promise<string> {
  try {
    const data = await slackGet("users.info", { user: userId }, token) as UserInfo;
    return data.user?.real_name || data.user?.name || userId;
  } catch {
    return userId;
  }
}

interface HistoryResponse {
  messages: Array<{
    type: string;
    subtype?: string;
    text: string;
    ts: string;
    user?: string;
    reply_count?: number;
  }>;
  has_more: boolean;
  response_metadata?: { next_cursor?: string };
}

export async function fetchChannelMessages(
  channel: ChannelConfig,
  oldest: number,
  latest: number,
  token: string
): Promise<ChannelDigest> {
  const messages: SlackMessage[] = [];
  const userCache = new Map<string, string>();
  let cursor: string | undefined;

  do {
    const params: Record<string, string> = {
      channel: channel.id,
      oldest: String(oldest),
      latest: String(latest),
      limit: "200",
      inclusive: "true",
    };
    if (cursor) params.cursor = cursor;

    const data = await slackGet("conversations.history", params, token) as HistoryResponse;

    for (const msg of data.messages) {
      // Skip bot messages, join/leave events, and channel notifications
      if (msg.subtype) continue;
      if (!msg.user) continue;
      if (!msg.text?.trim()) continue;

      let username = userCache.get(msg.user);
      if (!username) {
        username = await resolveUsername(msg.user, token);
        userCache.set(msg.user, username);
      }

      messages.push({
        ts: msg.ts,
        userId: msg.user,
        username,
        text: msg.text,
        replyCount: msg.reply_count,
      });
    }

    cursor = data.has_more ? data.response_metadata?.next_cursor : undefined;
  } while (cursor);

  // Sort oldest first
  messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  return { channel, messages };
}

export async function listJoinedChannels(token: string): Promise<Array<{ id: string; name: string }>> {
  const res = await slackGet("conversations.list", {
    types: "public_channel,private_channel",
    exclude_archived: "true",
    limit: "200",
  }, token) as { channels: Array<{ id: string; name: string; is_member: boolean }> };

  return res.channels.filter((c) => c.is_member).map((c) => ({ id: c.id, name: c.name }));
}
