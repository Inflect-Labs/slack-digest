export interface SlackConfig {
  channels: ChannelConfig[];
  defaults: {
    daysBack: number;
  };
}

export interface ChannelConfig {
  id: string;    // C024BE91L — needed for API calls
  name: string;  // general — for display
}

export interface SlackMessage {
  ts: string;
  userId: string;
  username: string;
  text: string;
  replyCount?: number;
}

export interface ChannelDigest {
  channel: ChannelConfig;
  messages: SlackMessage[];
}
