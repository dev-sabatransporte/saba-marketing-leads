import { AssistantService } from './components/assistant';
import { AuthService } from './components/auth';
import { HealthService } from './components/health';
import { LeadsService } from './components/leads';
import { WhatsAppService } from './components/whatsapp';
import type { HttpClient, TokenProvider } from './http';
import { SafeFetchClient } from './http';

/**
 * API configuration
 */
export interface APIConfig {
  baseURL: string;
  token?: TokenProvider;
  /** Called when the API answers 401 (expired or revoked session). */
  onUnauthorized?: () => void;
  /** Optional: provide a custom HttpClient implementation (for testing or alternative transports) */
  httpClient?: HttpClient;
}

/**
 * Versioned API service interface
 */
export interface APIService {
  assistant: AssistantService;
  auth: AuthService;
  health: HealthService;
  leads: LeadsService;
  whatsapp: WhatsAppService;
}

export class API {
  public readonly v1: APIService;

  /** Exposed for advanced use cases (e.g., making raw requests) */
  public readonly httpClient: HttpClient;

  constructor(config: APIConfig) {
    // Use provided HttpClient or create SafeFetchHttpClient
    this.httpClient =
      config.httpClient ??
      new SafeFetchClient({
        baseUrl: config.baseURL,
        token: config.token,
        onUnauthorized: config.onUnauthorized,
      });

    // Wire services with dependencies
    this.v1 = Object.freeze({
      assistant: new AssistantService(this.httpClient),
      auth: new AuthService(this.httpClient),
      health: new HealthService(this.httpClient),
      leads: new LeadsService(this.httpClient),
      whatsapp: new WhatsAppService(this.httpClient),
    });
  }
}
