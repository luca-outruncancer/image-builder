// src/utils/logger/index.ts
import { LOGGING } from '@/utils/constants';
import { Logger, LogData, ErrorLogData } from './types';

// Determine if we're running on the server
const isServer = typeof window === 'undefined';

// Create a base logger that works in both environments
const createBaseLogger = () => {
  if (isServer) {
    // Server-side logging with pino
    const pino = require('pino');
    return pino({
      level: LOGGING.LEVEL,
      base: {
        env: LOGGING.ENVIRONMENT,
        app: LOGGING.APP_PREFIX
      }
    });
  } else {
    // Client-side logging
    const clientLogger = {
      info: (obj: any) => console.log('[INFO]', obj),
      error: (obj: any) => console.error('[ERROR]', obj),
      debug: (obj: any) => console.debug('[DEBUG]', obj),
      warn: (obj: any) => console.warn('[WARN]', obj),
      trace: (obj: any) => console.trace('[TRACE]', obj),
      fatal: (obj: any) => console.error('[FATAL]', obj),
      child: function() { return clientLogger; }
    };
    return clientLogger;
  }
};

const baseLogger = createBaseLogger();

type LogMethod = (obj: object) => void;

// Create a wrapper for logger that handles both object and string-based logging
function createLoggerWrapper(logger: any): Logger {
  function createLogMethod(method: 'info' | 'error' | 'debug' | 'warn' | 'trace' | 'fatal') {
    return function(msgOrData: string | LogData, contextOrError?: Record<string, any> | Error, context?: Record<string, any>) {
      const timestamp = new Date().toISOString();
      if (typeof msgOrData === 'string') {
        // String-style logging
        if (method === 'error' && contextOrError instanceof Error) {
          logger[method]({ 
            msg: msgOrData, 
            err: { 
              message: contextOrError.message, 
              stack: contextOrError.stack 
            }, 
            timestamp,
            ...context 
          });
        } else if (contextOrError instanceof Error) {
          logger[method]({ 
            msg: msgOrData, 
            err: { 
              message: contextOrError.message, 
              stack: contextOrError.stack 
            }, 
            timestamp,
            ...context 
          });
        } else {
          logger[method]({ 
            msg: msgOrData, 
            timestamp,
            ...(contextOrError || {}), 
            ...(context || {}) 
          });
        }
      } else {
        // Object-style logging
        logger[method]({ ...msgOrData, timestamp });
      }
    };
  }

  return {
    info: createLogMethod('info'),
    error: createLogMethod('error'),
    debug: createLogMethod('debug'),
    warn: createLogMethod('warn'),
    trace: createLogMethod('trace'),
    fatal: createLogMethod('fatal')
  };
}

// Create component loggers with proper error handling
export const paymentLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.PAYMENT }));
export const blockchainLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.BLOCKCHAIN }));
export const walletLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.WALLET }));
export const canvasLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.CANVAS }));
export const imageLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.IMAGE }));
export const apiLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.API }));
export const storageLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.STORAGE }));
export const authLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.AUTH }));
export const systemLogger = createLoggerWrapper(baseLogger.child({ component: LOGGING.COMPONENTS.SYSTEM }));

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
  return createLoggerWrapper(baseLogger.child({
    component,
    requestId: getRequestId()
  }));
}

// Export the base logger as default
export default createLoggerWrapper(baseLogger); 