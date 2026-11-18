/** Worker bindings. Variables in wrangler.toml [vars] are public config; the rest are secrets. */
export interface Env {
  SUPABASE_URL: string;
  /** Public anon/publishable key (also used by the browser). */
  SUPABASE_ANON_KEY: string;
  /** Shared secret proving requests to gateway RPCs come from this Worker. */
  GATEWAY_KEY: string;
  /** Salt for respondent fingerprint hashing (duplicate prevention). */
  FINGERPRINT_SALT?: string;
  APP_BASE_URL: string;
  ALLOWED_ORIGINS?: string;

  AI_PROVIDER?: string; // "openai" | "openai_compatible" | "anthropic" | "none"
  AI_API_KEY?: string;
  AI_MODEL?: string;
  AI_BASE_URL?: string;
  AI_MAX_OUTPUT_TOKENS?: string;

  CLOUDINARY_CLOUD_NAME?: string;
  CLOUDINARY_API_KEY?: string;
  CLOUDINARY_API_SECRET?: string;

  EMAIL_PROVIDER?: string; // "resend" | "none"
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;

  PAYMENT_PROVIDER?: string; // "paystack" | "none"
  PAYSTACK_SECRET_KEY?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  jwt: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: AuthUser; requestId: string } };
