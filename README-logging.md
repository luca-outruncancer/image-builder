# Image Builder Logging System

This document describes the comprehensive logging system implemented in the Image Builder application. The system is designed to capture and record application events, errors, and user interactions for debugging, monitoring, and auditing purposes.

## Features

- **Multi-level logging**: DEBUG, INFO, and ERROR levels
- **Component-specific logging**: Different components have dedicated loggers
- **Database storage**: All logs are stored in a Supabase database
- **Console output**: Logs are also output to the console during development
- **Request tracking**: Each request gets a unique ID for cross-component tracking
- **Error boundaries**: React error boundaries capture and log frontend errors
- **API middleware**: Automatically logs all API requests and responses
- **Structured logging**: Logs include structured data in JSON format
- **Retention policies**: Automatic cleanup of old logs

## Usage

### Importing and Using Loggers

```typescript
// Import component-specific loggers
import { 
  paymentLogger, 
  blockchainLogger, 
  walletLogger, 
  canvasLogger, 
  imageLogger, 
  apiLogger, 
  storageLogger, 
  authLogger, 
  systemLogger 
} from '@/utils/logger';

// Log at different levels
paymentLogger.debug('Detailed debug information', { additionalData: 'value' });
paymentLogger.info('General information message');
paymentLogger.error('Error occurred', errorObject, contextObject, userWalletAddress);
```

### Creating Request IDs

```typescript
import { generateRequestId, getRequestId } from '@/utils/logger';

// Generate a new request ID at the start of a workflow
const requestId = generateRequestId();

// Later, get the current request ID
const currentRequestId = getRequestId();
```

### Error Handling in API Routes

```typescript
import { withErrorHandling, createApiError, ApiErrorType } from '@/utils/apiErrorHandler';

// Use the HOF to wrap your API handler
export const POST = withErrorHandling(async (request: NextRequest) => {
  // Your handler code here
  if (!requiredParam) {
    return createApiError(
      ApiErrorType.BAD_REQUEST,
      'Required parameter missing',
      { param: 'requiredParam' }
    );
  }
  
  // Rest of your code...
});
```

### Using Error Boundaries

```tsx
import ErrorBoundary from '@/components/ErrorBoundary';

function MyComponent() {
  return (
    <ErrorBoundary componentName="PaymentForm">
      <PaymentForm />
    </ErrorBoundary>
  );
}
```

## Configuration

Configuration for the logging system is located in `src/utils/constants.ts`. You can adjust:

- Log levels
- Whether to enable console and/or database logging
- Application prefix for logs
- Log retention period

```typescript
export const LOGGING = {
  ENABLE_CONSOLE_LOGGING: true,     // Enable logging to console
  ENABLE_DB_LOGGING: true,          // Enable logging to database
  LEVEL: LogLevel.DEBUG,            // Current log level
  APP_PREFIX: 'IMGBLDR',            // Application prefix for logs
  ENVIRONMENT: process.env.NODE_ENV || 'development',
  RETENTION_DAYS: 30,               // How many days to retain logs
  DB_TABLE: 'system_logs',          // Table name for logs
  // ...component names...
};
```

## Database Schema

The logging system uses a Supabase database table `system_logs` with the following schema:

```sql
CREATE TABLE IF NOT EXISTS system_logs (
  log_id SERIAL PRIMARY KEY,
  level TEXT NOT NULL,                     -- DEBUG, INFO, ERROR
  component TEXT NOT NULL,                 -- Component that generated the log
  message TEXT NOT NULL,                   -- Log message
  data JSONB,                              -- Additional structured data
  context JSONB,                           -- Contextual information
  environment TEXT NOT NULL,               -- Environment (dev, prod, etc.)
  request_id TEXT NOT NULL,                -- Unique ID for tracking related log entries
  user_wallet TEXT,                        -- Optional: Associated wallet address
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## SQL Utilities

The system includes several SQL stored procedures and functions for log analysis and retrieval:

- `search_logs()` - Search logs with multiple filter options
- `get_logs_for_image()` - Get all logs related to a specific image
- `get_logs_for_transaction()` - Get all logs for a specific blockchain transaction
- `get_recent_errors()` - Get recent error logs within a time period
- `get_error_stats()` - Get error statistics by component
- `cleanup_old_logs()` - Remove logs older than the retention period

## Integration Points

The logging system is integrated at several critical points in the application:

1. **Payment Processing** - Logs all stages of payment transactions
2. **API Requests** - Via middleware that logs all API interactions
3. **Image Uploads** - Detailed logging of image processing and storage
4. **Frontend Errors** - Via React Error Boundaries
5. **Authentication** - User authentication and wallet connection events

## Best Practices

When using the logging system, follow these best practices:

1. **Choose the right log level**:
   - DEBUG: Detailed information for debugging
   - INFO: General operational information
   - ERROR: Errors and exceptions

2. **Include context**:
   - Always include relevant context data
   - For payment logs, include transaction IDs and amounts
   - For errors, include the complete error object

3. **Use request IDs**:
   - Generate a request ID at the beginning of a user workflow
   - Pass the same request ID through all related operations
   - This allows tracking a user action across multiple components

4. **Include structured data**:
   - Use the data parameter for structured logging
   - This makes it easier to search and analyze logs later

5. **Log sensitive data carefully**:
   - Never log complete private keys or credentials
   - Truncate sensitive identifiers like wallet addresses when appropriate

## Viewing and Analyzing Logs

### Supabase Interface

You can view logs in the Supabase interface by:

1. Go to the Supabase dashboard
2. Select the project
3. Navigate to the SQL Editor
4. Run queries against the `system_logs` table

Example queries:

```sql
-- Get the most recent 50 error logs
SELECT * FROM system_logs
WHERE level = 'ERROR'
ORDER BY timestamp DESC
LIMIT 50;

-- Get all logs for a specific request
SELECT * FROM system_logs
WHERE request_id = '123e4567-e89b-12d3-a456-426614174000'
ORDER BY timestamp ASC;

-- Get errors by component in the last 24 hours
SELECT component, COUNT(*) as error_count
FROM system_logs
WHERE 
  level = 'ERROR' AND
  timestamp > NOW() - INTERVAL '24 hours'
GROUP BY component
ORDER BY error_count DESC;
```

### Custom Admin Dashboard

The admin dashboard provides a graphical interface for viewing and analyzing logs. Features include:

- Real-time log viewing
- Filtering by component, level, and date
- Error analytics and trends
- Search functionality
- Log export

To access the admin dashboard, navigate to `/admin/logs` (requires admin privileges).

## Future Enhancements

Planned enhancements for the logging system:

1. Log aggregation across multiple instances
2. Real-time log alerting
3. Advanced analytics dashboard
4. Log-based anomaly detection
5. Integration with external logging services

## Troubleshooting

If logs are not appearing as expected:

1. Check the log level in `constants.ts` - logs below the set level will not be recorded
2. Verify database connectivity for database logs
3. Ensure the `system_logs` table exists in the database
4. Check for errors in the console related to logger initialization