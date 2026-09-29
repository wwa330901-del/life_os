// Must be imported first — before any other import in main.ts, and before
// `AppModule`/anything from `@nestjs/*` — so Sentry can instrument Node's
// built-in modules (http, etc.) before they're first required anywhere
// else in the process. See main.ts.
//
// No-ops entirely when SENTRY_DSN isn't set (e.g. local dev, or before
// you've created a Sentry project) — Sentry.init() with dsn: undefined
// just disables the SDK rather than throwing, so this file is always safe
// to import.
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  // Traces are opt-in-cost on Sentry's side too — keep this low (10%) so a
  // personal-scale app doesn't burn through the free tier's event quota
  // just from routine request tracing. Error events are always captured
  // regardless of this setting.
  tracesSampleRate: 0.1,
});
