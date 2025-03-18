import * as Sentry from "@sentry/nextjs";
import { Replay } from "@sentry/replay";
import { LOGGING } from "./constants";
import { walletLogger } from "./logger/index";

export const initializeSentry = () => {
  if (!LOGGING.SENTRY.ENABLED || !LOGGING.SENTRY.DSN) {
    walletLogger.info("Sentry is disabled or DSN is not configured");
    return;
  }

  Sentry.init({
    dsn: LOGGING.SENTRY.DSN,
    environment: LOGGING.SENTRY.ENVIRONMENT,
    tracesSampleRate: LOGGING.SENTRY.TRACES_SAMPLE_RATE,
    replaysOnErrorSampleRate: LOGGING.SENTRY.REPLAYS_SAMPLE_RATE,
    replaysSessionSampleRate: LOGGING.SENTRY.REPLAYS_SESSION_SAMPLE_RATE,
    maxBreadcrumbs: LOGGING.SENTRY.MAX_BREADCRUMBS,
    attachStacktrace: LOGGING.SENTRY.ATTACH_STACKTRACE,
    normalizeDepth: LOGGING.SENTRY.NORMALIZE_DEPTH,
    maxValueLength: LOGGING.SENTRY.MAX_VALUE_LENGTH,
    integrations: [
      new Sentry.BrowserTracing(),
      new Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
};

export const captureException = (
  error: Error,
  context?: Record<string, any>,
) => {
  if (!LOGGING.SENTRY.ENABLED) return;

  Sentry.captureException(error, {
    extra: context,
  });
};

export const captureMessage = (
  message: string,
  level: Sentry.SeverityLevel = "info",
  context?: Record<string, any>,
) => {
  if (!LOGGING.SENTRY.ENABLED) return;

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
};

export const setUser = (id: string, email?: string, role?: string) => {
  if (!LOGGING.SENTRY.ENABLED) return;

  Sentry.setUser({
    id,
    email,
    role,
  });
};

export const clearUser = () => {
  if (!LOGGING.SENTRY.ENABLED) return;

  Sentry.setUser(null);
};
