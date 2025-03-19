// src/utils/logger/index.ts
import { LOGGING, LogLevel } from "@/utils/constants";
import { Logger, LogData } from "./types";
import pino from "pino";
import * as Sentry from "@sentry/nextjs";

// Determine if we're running on the server
const isServer = typeof window === "undefined";

// Utility function to convert string log level to numeric value
const getLogLevelValue = (level: string): number => {
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'none': return LogLevel.NONE;
    default: return LogLevel.INFO; // Default to INFO
  }
};

// Get the current log level as a number for comparison
const currentLogLevel = getLogLevelValue(LOGGING.CLIENT.LOG_LEVEL);

// Create a base logger that works in both environments
const createBaseLogger = () => {
  if (isServer) {
    // Server-side logging with pino
    // In production or when running in Next.js SSR, we need to be careful with transports
    const isNextJsServer = process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge';
    
    // Basic configuration without transport for SSR environments
    const baseConfig = {
      level: LOGGING.CLIENT.LOG_LEVEL,
      redact: {
        paths: ["wallet.privateKey", "*.privateKey", "password"],
        remove: true,
      },
      base: {
        environment: LOGGING.SENTRY.ENVIRONMENT,
      },
    };
    
    // Only use transport in development and when not in Next.js SSR
    if (process.env.NODE_ENV === 'development' && !isNextJsServer) {
      return pino({
        ...baseConfig,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        },
      });
    }
    
    // Use basic configuration for production or SSR
    return pino(baseConfig);
  } else {
    // Client-side logging with Sentry integration
    const clientLogger = {
      error: (msg: string, error?: Error, context?: any) => {
        if (LOGGING.CLIENT.ENABLED && currentLogLevel <= LogLevel.ERROR) {
          console.error(msg, error, context);
          if (error) {
            Sentry.captureException(error, { message: msg, ...context });
          } else {
            Sentry.captureMessage(msg, { level: "error", ...context });
          }
        }
      },
      info: (obj: any) => {
        if (LOGGING.CLIENT.ENABLED && currentLogLevel <= LogLevel.INFO) {
          console.log(obj);
          Sentry.captureMessage(
            typeof obj === "string" ? obj : JSON.stringify(obj),
            { level: "info" }
          );
        }
      },
      debug: (obj: any) => {
        if (LOGGING.CLIENT.ENABLED && currentLogLevel <= LogLevel.DEBUG) {
          console.debug(obj);
          Sentry.captureMessage(
            typeof obj === "string" ? obj : JSON.stringify(obj),
            { level: "debug" }
          );
        }
      },
      warn: (obj: any) => {
        if (LOGGING.CLIENT.ENABLED && currentLogLevel <= LogLevel.WARN) {
          console.warn(obj);
          Sentry.captureMessage(
            typeof obj === "string" ? obj : JSON.stringify(obj),
            { level: "warning" }
          );
        }
      },
      child: function () {
        return clientLogger;
      },
    };
    return clientLogger;
  }
};

const baseLogger = createBaseLogger();

type LogMethod = (obj: object) => void;

// Create a wrapper for logger that handles both object and string-based logging
function createLoggerWrapper(logger: any): Logger {
  function createLogMethod(
    method: "info" | "error" | "debug" | "warn" | "trace" | "fatal",
  ) {
    return function (
      msgOrData: string | LogData,
      contextOrError?: Record<string, any> | Error,
      context?: Record<string, any>,
    ) {
      // Skip logging if client-side and log level doesn't match
      if (!isServer) {
        // Map method to LogLevel
        let methodLevel: number;
        switch (method) {
          case "debug": methodLevel = LogLevel.DEBUG; break;
          case "info": methodLevel = LogLevel.INFO; break;
          case "warn": methodLevel = LogLevel.WARN; break;
          case "error": case "fatal": methodLevel = LogLevel.ERROR; break;
          case "trace": methodLevel = LogLevel.DEBUG; break;
          default: methodLevel = LogLevel.INFO;
        }
        
        // Skip if level is higher than configured level
        if (!LOGGING.CLIENT.ENABLED || currentLogLevel > methodLevel) {
          return;
        }
      }
      
      const timestamp = new Date().toISOString();
      if (typeof msgOrData === "string") {
        // String-style logging
        if (method === "error" && contextOrError instanceof Error) {
          logger[method]({
            msg: msgOrData,
            err: {
              message: contextOrError.message,
              stack: contextOrError.stack,
            },
            timestamp,
            ...context,
          });
        } else if (contextOrError instanceof Error) {
          logger[method]({
            msg: msgOrData,
            err: {
              message: contextOrError.message,
              stack: contextOrError.stack,
            },
            timestamp,
            ...context,
          });
        } else {
          logger[method]({
            msg: msgOrData,
            timestamp,
            ...(contextOrError || {}),
            ...(context || {}),
          });
        }
      } else {
        // Object-style logging
        logger[method]({ ...msgOrData, timestamp });
      }
    };
  }

  return {
    info: createLogMethod("info"),
    error: createLogMethod("error"),
    debug: createLogMethod("debug"),
    warn: createLogMethod("warn"),
    trace: createLogMethod("trace"),
    fatal: createLogMethod("fatal"),
  };
}

// Create component loggers with proper error handling
export const paymentLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.PAYMENT }),
);
export const blockchainLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.BLOCKCHAIN }),
);
export const walletLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.WALLET }),
);
export const canvasLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.CANVAS }),
);
export const imageLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.IMAGE }),
);
export const apiLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.API }),
);
export const storageLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.STORAGE }),
);
export const authLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.AUTH }),
);
export const systemLogger = createLoggerWrapper(
  baseLogger.child({ component: LOGGING.COMPONENTS.SYSTEM }),
);

// Log the current logger configuration when in development mode
if (process.env.NODE_ENV === 'development' && !isServer) {
  console.log('[Logger] Configuration:', {
    enabled: LOGGING.CLIENT.ENABLED,
    logLevel: LOGGING.CLIENT.LOG_LEVEL,
    numericLevel: currentLogLevel,
    environment: LOGGING.SENTRY.ENVIRONMENT,
    visibleLevels: {
      error: currentLogLevel <= LogLevel.ERROR,
      warn: currentLogLevel <= LogLevel.WARN,
      info: currentLogLevel <= LogLevel.INFO,
      debug: currentLogLevel <= LogLevel.DEBUG
    }
  });
}

// Request ID tracking with proper typing
let currentRequestId: string | null = null;

export function generateRequestId(): string {
  currentRequestId = crypto.randomUUID();
  return currentRequestId;
}

export function getRequestId(): string {
  if (!currentRequestId) {
    return generateRequestId();
  }
  return currentRequestId;
}

// Create a request-scoped logger with proper typing
export function createRequestLogger(component: string): Logger {
  return createLoggerWrapper(
    baseLogger.child({
      component,
      requestId: getRequestId(),
    }),
  );
}

// Export the base logger as default
export default createLoggerWrapper(baseLogger);
