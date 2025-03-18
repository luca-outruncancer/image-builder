import * as Sentry from "@sentry/nextjs";
import { Replay } from "@sentry/replay";
import { LOGGING } from "./constants";
import { systemLogger } from "./logger/index";

export const initializeSentry = () => {
  if (!LOGGING.SENTRY.ENABLED || !LOGGING.SENTRY.DSN) {
    systemLogger.info("Sentry is disabled or DSN is not configured");
    return;
  }

  Sentry.init({
    dsn: LOGGING.SENTRY.DSN,
    environment: LOGGING.SENTRY.ENVIRONMENT,
    tracesSampleRate: LOGGING.SENTRY.TRACES_SAMPLE_RATE,
    replaysOnErrorSampleRate: LOGGING.SENTRY.REPLAY_ON_ERROR_SAMPLE_RATE,
    replaysSessionSampleRate: LOGGING.SENTRY.REPLAY_SAMPLE_RATE,
    maxBreadcrumbs: 100,
    attachStacktrace: true,
    normalizeDepth: 10,
    maxValueLength: 1000,
    integrations: [
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
