import { z } from 'zod';
import { LENGTH_LIMITS, maxLengthMessage } from '../lengthLimits';
import { buildSafeResponseSchema } from '../utils';

/** Saba staff roles (`profiles.role`) that can get into the panel. */
export const STAFF_ROLES = ['admin', 'cajero', 'vendedor'] as const;
export const staffRoleSchema = z.enum(STAFF_ROLES);
export type TStaffRole = z.infer<typeof staffRoleSchema>;

/**
 * Panel permissions, `<resource>:<action>`. Saba grants them and the API
 * enforces them; the client only uses them to render.
 * - `marketing:access`: `profiles.has_marketing_access`.
 * - `assistant:manage`: `profiles.can_manage_assistant` on top of panel access;
 *   turns the WhatsApp assistant on or off.
 */
export const PERMISSIONS = ['marketing:access', 'assistant:manage'] as const;
export const permissionSchema = z.enum(PERMISSIONS);
export type TPermission = z.infer<typeof permissionSchema>;

/**
 * Login error codes the client tells apart: lockout and rate limit ones are
 * shown as a warning, not as an error.
 */
export const AUTH_ERROR_CODES = {
  invalidCredentials: 'AUTH_INVALID_CREDENTIALS',
  invalidCaptcha: 'AUTH_INVALID_CAPTCHA',
  tooManyAttempts: 'AUTH_TOO_MANY_ATTEMPTS',
  accountLocked: 'AUTH_ACCOUNT_LOCKED',
  noAccess: 'AUTH_NO_ACCESS',
  invalidSession: 'AUTH_INVALID_SESSION',
  permissionDenied: 'AUTH_PERMISSION_DENIED',
  unavailable: 'AUTH_UNAVAILABLE',
} as const;
export type TAuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

/** Password cap: Supabase Auth (behind Saba) does not accept more than 72 bytes (bcrypt). */
const PASSWORD_MAX = 72;
/** Turnstile tokens are around 2 KB. */
const CAPTCHA_TOKEN_MAX = 4096;
/** Supabase refresh tokens are short; the cap only stops abuse. */
const REFRESH_TOKEN_MAX = 512;

/** Body of `POST /auth/login`. */
export const loginSchema = z.object({
  email: z
    .email('El correo no es válido.')
    .max(
      LENGTH_LIMITS.email,
      maxLengthMessage('El correo', LENGTH_LIMITS.email)
    )
    .transform((email) => email.trim().toLowerCase()),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria.')
    .max(PASSWORD_MAX, maxLengthMessage('La contraseña', PASSWORD_MAX)),
  captchaToken: z
    .string()
    .min(1, 'Completa el CAPTCHA.')
    .max(CAPTCHA_TOKEN_MAX),
});
export type TLogin = z.infer<typeof loginSchema>;

/** Body of `POST /auth/refresh`. */
export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1).max(REFRESH_TOKEN_MAX),
});
export type TRefreshSession = z.infer<typeof refreshSessionSchema>;

export const sessionTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access token expiry, in seconds since epoch (like `exp`). */
  expiresAt: z.number().int(),
});
export type TSessionTokens = z.infer<typeof sessionTokensSchema>;

/** Who holds the session: what the user menu renders. */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: staffRoleSchema,
  permissions: z.array(permissionSchema),
});
export type TSessionUser = z.infer<typeof sessionUserSchema>;

export const loginResponseSchema = buildSafeResponseSchema(
  z.object({ session: sessionTokensSchema, user: sessionUserSchema })
);
export type TLoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshSessionResponseSchema =
  buildSafeResponseSchema(sessionTokensSchema);
export type TRefreshSessionResponse = z.infer<
  typeof refreshSessionResponseSchema
>;

export const meResponseSchema = buildSafeResponseSchema(sessionUserSchema);
export type TMeResponse = z.infer<typeof meResponseSchema>;
