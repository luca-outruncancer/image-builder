// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { LOGGING } from "./src/utils/constants";

Sentry.init({
  dsn: LOGGING.SENTRY.DSN,
  enabled: LOGGING.SENTRY.ENABLED,
  environment: LOGGING.SENTRY.ENVIRONMENT,
  tracesSampleRate: LOGGING.SENTRY.TRACES_SAMPLE_RATE,
  // Edge runtime doesn't support replay functionality
});
