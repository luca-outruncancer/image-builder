// src/utils/logger.ts
import { LogLevel, LOGGING } from '@/utils/constants';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

// Use environment variables for Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Supabase client
let supabase: any = null;

// Initialize only if DB logging is enabled
if (LOGGING.ENABLE_DB_LOGGING && supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("Supabase client initialized for logging");
  } catch (error) {
    console.error("Failed to initialize Supabase client for logging:", error);
  }
}

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

// Set the request ID manually (useful for API routes)
export function setRequestId(requestId: string): void {
  currentRequestId = requestId;
}

/**
 * Log to the database
 */
async function logToDatabase(
  level: string,
  component: string,
  message: string,
  data?: any,
  context?: any,
  userWallet?: string
): Promise<boolean> {
  if (!supabase || !LOGGING.ENABLE_DB_LOGGING) return false;
  
  try {
    // Get or generate a request ID
    const requestId = getRequestId();
    
    const { data: logData, error } = await supabase
      .from(LOGGING.DB_TABLE)
      .insert({
        level,
        component,
        message,
        data: data ? JSON.stringify(data) : null,
        context: context ? JSON.stringify(context) : null,
        environment: LOGGING.ENVIRONMENT,
        request_id: requestId,
        user_wallet: userWallet,
        timestamp: new Date().toISOString()
      });
    
    if (error) {
      console.error('Failed to log to database:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error logging to database:', error);
    return false;
  }
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
  
  switch (level) {
    case 'ERROR':
      console.error(`${prefix} ${message}`, data || '');
      if (context) console.error(`${prefix} Context:`, context);
      break;
    case 'DEBUG':
      console.debug(`${prefix} ${message}`, data || '');
      if (context) console.debug(`${prefix} Context:`, context);
      break;
    case 'INFO':
    default:
      console.log(`${prefix} ${message}`, data || '');
      if (context) console.log(`${prefix} Context:`, context);
      break;
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
    case LogLevel.ERROR:
      levelString = 'ERROR';
      break;
    case LogLevel.INFO:
    default:
      levelString = 'INFO';
      break;
  }
  
  // Log to console
  logToConsole(levelString, component, message, data, context);
  
  // Log to database
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
  
  error: (component: string, message: string, data?: any, context?: any, userWallet?: string) => 
    log(LogLevel.ERROR, component, message, data, context, userWallet),
  
  // Create logger for specific component
  component: (component: string) => ({
    debug: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.DEBUG, component, message, data, context, userWallet),
    
    info: (message: string, data?: any, context?: any, userWallet?: string) => 
      log(LogLevel.INFO, component, message, data, context, userWallet),
    
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