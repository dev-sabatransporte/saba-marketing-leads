export const ASSISTANT_TOKENS = {
  Config: Symbol('AssistantConfig'),
  Clock: Symbol('AssistantClockPort'),
  Logger: Symbol('AssistantLogger'),
  Model: Symbol('AssistantModelPort'),
  Stores: Symbol('StoresSourcePort'),
  Channel: Symbol('AssistantChannelPort'),
  Settings: Symbol('AssistantSettingsRepositoryPort'),
  Runs: Symbol('AssistantRunsRepositoryPort'),
  HandleInboundMessage: Symbol('HandleInboundMessagePort'),
} as const;
