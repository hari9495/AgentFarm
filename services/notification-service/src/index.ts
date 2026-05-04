export const serviceName = 'notification-service';
export { sendDiscord, buildDiscordRequest } from './channels/discord-adapter.js';
export { sendSlack, buildSlackRequest } from './channels/slack-adapter.js';
export { sendTelegram, buildTelegramRequest } from './channels/telegram-adapter.js';
export { sendVoice, buildVoiceRequest } from './channels/voice-adapter.js';
export { dispatch, dispatchApprovalAlert } from './notification-dispatcher.js';
export type { ChannelFetcher } from './notification-dispatcher.js';

