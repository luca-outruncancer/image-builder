-- src/database/logging_schema.sql
-- Schema for the system logging tables and related functions

-- System logs table for application-wide logging
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_component ON system_logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_request_id ON system_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_user_wallet ON system_logs(user_wallet);

-- Add comments for documentation
COMMENT ON TABLE system_logs IS 'System-wide logging table for application events';
COMMENT ON COLUMN system_logs.level IS 'Log level: DEBUG, INFO, ERROR';
COMMENT ON COLUMN system_logs.component IS 'Application component that generated the log';
COMMENT ON COLUMN system_logs.message IS 'Human-readable log message';
COMMENT ON COLUMN system_logs.data IS 'JSON data associated with the log entry';
COMMENT ON COLUMN system_logs.context IS 'Contextual information about the log entry';
COMMENT ON COLUMN system_logs.environment IS 'Application environment (development, production, etc.)';
COMMENT ON COLUMN system_logs.request_id IS 'Unique ID to correlate log entries from the same request';
COMMENT ON COLUMN system_logs.user_wallet IS 'User wallet address associated with the log entry, if applicable';

-- Function to clean up old logs (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM system_logs
  WHERE timestamp < (CURRENT_TIMESTAMP - (retention_days || ' days')::INTERVAL)
  RETURNING COUNT(*) INTO deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled task to clean up logs (runs daily at 1 AM)
DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Schedule log cleanup task
    PERFORM cron.schedule(
      'cleanup-logs-daily',  -- unique identifier
      '0 1 * * *',          -- cron expression (1 AM daily)
      $$SELECT cleanup_old_logs()$$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Log cleanup will not be scheduled automatically.';
  END IF;
END
$$;

-- Views for common log queries

-- Recent errors view
CREATE OR REPLACE VIEW recent_errors AS
SELECT *
FROM system_logs
WHERE level = 'ERROR'
ORDER BY timestamp DESC
LIMIT 100;

-- Log summary view (counts by level and component)
CREATE OR REPLACE VIEW log_summary AS
SELECT 
  date_trunc('day', timestamp) AS day,
  level,
  component,
  COUNT(*) AS log_count
FROM system_logs
WHERE timestamp > (CURRENT_TIMESTAMP - INTERVAL '30 days')
GROUP BY day, level, component
ORDER BY day DESC, level, component;

-- Functions for log analysis

-- Get all logs for a specific request
CREATE OR REPLACE FUNCTION get_request_logs(req_id TEXT)
RETURNS SETOF system_logs AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM system_logs
  WHERE request_id = req_id
  ORDER BY timestamp;
END;
$$ LANGUAGE plpgsql;