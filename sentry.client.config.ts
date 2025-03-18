// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';
import { Replay } from '@sentry/replay';
import { LOGGING } from './src/utils/constants';

Sentry.init({
  dsn: LOGGING.SENTRY.DSN,
  enabled: LOGGING.SENTRY.ENABLED,
  environment: LOGGING.SENTRY.ENVIRONMENT,
  tracesSampleRate: LOGGING.SENTRY.TRACES_SAMPLE_RATE,
  replaysSessionSampleRate: LOGGING.SENTRY.REPLAY_SAMPLE_RATE,
  replaysOnErrorSampleRate: LOGGING.SENTRY.REPLAY_ON_ERROR_SAMPLE_RATE,
  integrations: [
    new Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
