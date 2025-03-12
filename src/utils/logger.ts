// src/utils/logger.ts
import { LogLevel, LOGGING } from '@/utils/constants';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isSupabaseInitialized, getSupabaseError } from '@/lib/supabase';

// Track current request ID
let currentRequestId: string | null = null;

// Initialize logging state
let isDbLoggingEnabled = false;

// Initialize logging
async function initializeLogging() {
  if (!isDbLoggingEnabled && LOGGING.ENABLE_DB_LOGGING) {
    if (isSupabaseInitialized()) {
      isDbLoggingEnabled = true;
      console.log('[IMGBLDR] [INFO] [SYSTEM] Database logging enabled');
    } else {
      const error = getSupabaseError();
      console.warn('[IMGBLDR] [WARN] [SYSTEM] Database logging is disabled', {
        reason: error ? `Supabase initialization failed: ${error.message}` : 'Supabase client not available'
      });
    }
  }
}

// Initialize logging on module load
initializeLogging();

// Generate a new request ID for the current request lifecycle
export function generateRequestId(): string {
  currentRequestId = uuidv4();
  return currentRequestId;
}

// Get the current request ID or generate a new one
export function getRequestId(): string {
  if (!currentRequestId) {
    return generateRequestId();
  }
  return currentRequestId;
}

/**
 * Format error object for logging
 */
function formatError(error: any): string {
  if (!error) return '';
  
  if (error instanceof Error) {
    const errorObj: Record<string, any> = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
    
    // Add any additional properties from the error object
    Object.getOwnPropertyNames(error).forEach(key => {
      if (key !== 'name' && key !== 'message' && key !== 'stack') {
        errorObj[key] = (error as any)[key];
      }
    });
    
    return JSON.stringify(errorObj);
  }
  
  return typeof error === 'object' ? JSON.stringify(error) : String(error);
}

/**
 * Log to console with formatted message
 */
function logToConsole(
  level: string,
  component: string,
  message: string,
  data?: any,
  context?: any
): void {
  if (!LOGGING.ENABLE_CONSOLE_LOGGING) return;
  
  const timestamp = new Date().toISOString();
  const requestId = getRequestId();
  const prefix = `[${timestamp}] [${LOGGING.APP_PREFIX}] [${level}] [${component}] [${requestId.substring(0, 8)}]`;
  
  // Format data and context for better readability
  const formattedData = data ? (data instanceof Error ? formatError(data) : 
    (typeof data === 'object' ? JSON.stringify(data, null, 2) : data)) : '';
  const formattedContext = context ? JSON.stringify(context, null, 2) : '';
  
  switch (level) {
    case 'ERROR':
      console.error(`${prefix} ${message}`, formattedData);
      if (context) console.error(`${prefix} Context:`, formattedContext);
      break;
    case 'WARN':
      console.warn(`${prefix} ${message}`, formattedData);
      if (context) console.warn(`${prefix} Context:`, formattedContext);
      break;
    case 'DEBUG':
      console.debug(`${prefix} ${message}`, formattedData);
      if (context) console.debug(`${prefix} Context:`, formattedContext);
      break;
    case 'INFO':
    default:
      console.log(`${prefix} ${message}`, formattedData);
      if (context) console.log(`${prefix} Context:`, formattedContext);
      break;
  }
}

/**
 * Log to the database with retry logic
 */
async function logToDatabase(
  level: string,
  component: string,
  message: string,
  data: any = null,
  context: any = null,
  retryCount = 0
): Promise<boolean> {
  if (!isDbLoggingEnabled || !supabase) {
    logToConsole('WARN', 'SYSTEM', 'Database logging is disabled', {
      reason: !LOGGING.ENABLE_DB_LOGGING ? 'ENABLE_DB_LOGGING is false' :
              !supabase ? 'Supabase client not available' :
              'Supabase client failed to initialize'
    });
    return false;
  }

  try {
    const logEntry = {
      level: level.toUpperCase(),
      component,
      message,
      data: data ? JSON.stringify(data) : null,
      context: context ? JSON.stringify(context) : null,
      request_id: getRequestId(),
      environment: LOGGING.ENVIRONMENT || 'development',
      ttimestamp: new Date().toISOString()
    };

    const { error } = await supabase
      .from('application_logs')
      .insert(logEntry);

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    if (retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      return logToDatabase(level, component, message, data, context, retryCount + 1);
    }
    
    logToConsole('ERROR', 'SYSTEM', 'Failed to write to database log', {
      error,
      entry: { level, component, message }
    });
    return false;
  }
}

/**
 * Main logging function that handles both console and database logging
 */
export async function log(
  level: LogLevel,
  component: string,
  message: string,
  data?: any,
  context?: any
): Promise<void> {
  // Check if we should log based on the configured level
  if (level < LOGGING.LEVEL) return;
  
  // Map numeric level to string
  let levelString: string;
  switch (level) {
    case LogLevel.DEBUG:
      levelString = 'DEBUG';
      break;
    case LogLevel.WARN:
      levelString = 'WARN';
      break;
    case LogLevel.ERROR:
      levelString = 'ERROR';
      break;
    case LogLevel.INFO:
    default:
      levelString = 'INFO';
      break;
  }
  
  // Always log to console first for immediate feedback
  logToConsole(levelString, component, message, data, context);
  
  // Then attempt to log to database
  if (LOGGING.ENABLE_DB_LOGGING) {
    await logToDatabase(levelString, component, message, data, context);
  }
}

// Convenience methods for different log levels
export const logger = {
  debug: (component: string, message: string, data?: any, context?: any) => 
    log(LogLevel.DEBUG, component, message, data, context),
  
  info: (component: string, message: string, data?: any, context?: any) => 
    log(LogLevel.INFO, component, message, data, context),
  
  warn: (component: string, message: string, data?: any, context?: any) => 
    log(LogLevel.WARN, component, message, data, context),
  
  error: (component: string, message: string, data?: any, context?: any) => 
    log(LogLevel.ERROR, component, message, data, context),
  
  // Create logger for specific component
  component: (component: string) => ({
    debug: (message: string, data?: any, context?: any) => 
      log(LogLevel.DEBUG, component, message, data, context),
    
    info: (message: string, data?: any, context?: any) => 
      log(LogLevel.INFO, component, message, data, context),
    
    warn: (message: string, data?: any, context?: any) => 
      log(LogLevel.WARN, component, message, data, context),
    
    error: (message: string, data?: any, context?: any) => 
      log(LogLevel.ERROR, component, message, data, context)
  })
};

// Export component-specific loggers
export const paymentLogger = logger.component(LOGGING.COMPONENTS.PAYMENT);
export const blockchainLogger = logger.component(LOGGING.COMPONENTS.BLOCKCHAIN);
export const walletLogger = logger.component(LOGGING.COMPONENTS.WALLET);
export const canvasLogger = logger.component(LOGGING.COMPONENTS.CANVAS);
export const imageLogger = logger.component(LOGGING.COMPONENTS.IMAGE);
export const apiLogger = logger.component(LOGGING.COMPONENTS.API);
export const storageLogger = logger.component(LOGGING.COMPONENTS.STORAGE);
export const authLogger = logger.component(LOGGING.COMPONENTS.AUTH);
export const systemLogger = logger.component(LOGGING.COMPONENTS.SYSTEM);

export default logger;