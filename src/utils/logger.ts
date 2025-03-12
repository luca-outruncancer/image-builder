// src/utils/logger.ts
import { LogLevel, LOGGING } from '@/utils/constants';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Track current request ID
let currentRequestId: string | null = null;

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

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: any = null;
let dbLoggingEnabled = false;

// Initialize only if DB logging is enabled
if (LOGGING.ENABLE_DB_LOGGING && supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    dbLoggingEnabled = true;
    logToConsole('INFO', 'SYSTEM', 'Supabase client initialized for logging');
  } catch (error) {
    logToConsole('ERROR', 'SYSTEM', 'Failed to initialize Supabase client for logging', error);
  }
}

/**
 * Log to the database with retry logic
 */
async function logToDatabase(
  level: string,
  component: string,
  message: string,
  data?: any,
  context?: any,
  userWallet?: string,
  retryCount: number = 0
): Promise<boolean> {
  if (!dbLoggingEnabled) return false;
  
  const maxRetries = 2;
  const retryDelay = 1000; // 1 second
  
  try {
    // Get or generate a request ID
    const requestId = getRequestId();
    
    // Format data and context for database storage
    const formattedData = data ? (data instanceof Error ? formatError(data) : 
      (typeof data === 'object' ? JSON.stringify(data) : String(data))) : null;
    const formattedContext = context ? 
      (typeof context === 'object' ? JSON.stringify(context) : String(context)) : null;
    
    const { error } = await supabase
      .from('application_logs')
      .insert({
        level: level.toUpperCase(),  // Ensure correct case for enum
        component,
        message,
        data: formattedData ? JSON.parse(formattedData) : null,
        context: formattedContext ? JSON.parse(formattedContext) : null,
        environment: LOGGING.ENVIRONMENT,
        request_id: requestId,
        sender_wallet: userWallet,
        ttimestamp: new Date().toISOString()  // Changed from timestamp to ttimestamp
      });
    
    if (error) {
      // Only log database errors to console if it's not a retry attempt
      if (retryCount === 0) {
        logToConsole('ERROR', 'SYSTEM', 'Failed to log to database', error);
      }
      
      // Retry if we haven't exceeded max retries
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return logToDatabase(level, component, message, data, context, userWallet, retryCount + 1);
      }
      return false;
    }
    
    return true;
  } catch (error) {
    // Only log to console if it's not a retry attempt
    if (retryCount === 0) {
      logToConsole('ERROR', 'SYSTEM', 'Error logging to database', error);
    }
    
    // Retry if we haven't exceeded max retries
    if (retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return logToDatabase(level, component, message, data, context, userWallet, retryCount + 1);
    }
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
  context?: any,
  userWallet?: string
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
    await logToDatabase(levelString, component, message, data, context, userWallet);
  }
}

// Convenience methods for different log levels
export const logger = {
  debug: (component: string, message: string, data?: any, context?: any, userWallet?: string) => 
    log(LogLevel.DEBUG, component, message, data, context, userWallet),
  
  info: (component: string, message: string, data?: any, context?: any, userWallet?: string) => 
    log(LogLevel.INFO, component, message, data, context, userWallet),
  
  warn: (component: string, message: string, data?: any, context?: any, userWallet?: string) => 
    log(LogLevel.WARN, component, message, data, context, userWallet),
  
  error: (component: string, message: string, data?: any, context?: any, userWallet?: string) => 
    log(LogLevel.ERROR, component, message, data, context, userWallet),
  
  // Create logger for specific component
  component: (component: string) => ({
    debug: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.DEBUG, component, message, data, context, userWallet),
    
    info: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.INFO, component, message, data, context, userWallet),
    
    warn: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.WARN, component, message, data, context, userWallet),
    
    error: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.ERROR, component, message, data, context, userWallet)
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