/**
 * Base interface for log data
 */
export interface LogData {
  [key: string]: any;
  timestamp?: string;
}

/**
 * Interface for error log data
 */
export interface ErrorLogData extends LogData {
  error: Error;
}

/**
 * Logger interface defining the logging methods
 */
export interface Logger {
  info: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
  
  error: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
  
  debug: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
  
  warn: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
  
  trace: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
  
  fatal: (
    msgOrData: string | LogData, 
    contextOrError?: Record<string, any> | Error, 
    context?: Record<string, any>
  ) => void;
} 