// src/utils/logger/types.ts
import pino from 'pino';

export interface LogData {
  msg: string;
  [key: string]: any;
}

export interface ErrorLogData extends LogData {
  err?: Error;
}

export interface Logger {
  // Object-style logging
  info(data: LogData): void;
  error(data: ErrorLogData): void;
  debug(data: LogData): void;
  warn(data: LogData): void;
  trace(data: LogData): void;
  fatal(data: LogData): void;

  // String-style logging with optional context
  info(msg: string, context?: Record<string, any>): void;
  error(msg: string, error?: Error, context?: Record<string, any>): void;
  debug(msg: string, context?: Record<string, any>): void;
  warn(msg: string, context?: Record<string, any>): void;
  trace(msg: string, context?: Record<string, any>): void;
  fatal(msg: string, context?: Record<string, any>): void;
}

export type ChildLogger = Logger; 