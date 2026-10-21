export const ASSISTANT_TOKENS = {
  Config: Symbol('AssistantConfig'),
  Clock: Symbol('AssistantClockPort'),
  Logger: Symbol('AssistantLogger'),
  Model: Symbol('AssistantModelPort'),
  Stores: Symbol('StoresSourcePort'),
  Products: Symbol('ProductCatalogPort'),
  Channel: Symbol('AssistantChannelPort'),
  Settings: Symbol('AssistantSettingsRepositoryPort'),
  Runs: Symbol('AssistantRunsRepositoryPort'),
  HandleInboundMessage: Symbol('HandleInboundMessagePort'),
  GetSettings: Symbol('GetAssistantSettingsPort'),
  UpdateSettings: Symbol('UpdateAssistantSettingsPort'),
} as const;
