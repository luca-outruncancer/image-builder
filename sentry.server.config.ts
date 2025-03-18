// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { LOGGING } from "./src/utils/constants";

Sentry.init({
  dsn: LOGGING.SENTRY.DSN,
  enabled: LOGGING.SENTRY.ENABLED,
  environment: LOGGING.SENTRY.ENVIRONMENT,
  tracesSampleRate: LOGGING.SENTRY.TRACES_SAMPLE_RATE,
  // Server-side doesn't need replay functionality
});
