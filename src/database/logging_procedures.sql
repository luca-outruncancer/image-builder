-- src/database/logging_procedures.sql
-- Additional stored procedures and functions for the logging system

-- Create a function to search logs by parameters
CREATE OR REPLACE FUNCTION search_logs(
  p_level TEXT DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL,
  p_user_wallet TEXT DEFAULT NULL,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  log_id INTEGER,
  level TEXT,
  component TEXT,
  message TEXT,
  data JSONB,
  context JSONB,
  environment TEXT,
  request_id TEXT,
  user_wallet TEXT,
  timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM system_logs
  WHERE (p_level IS NULL OR level = p_level)
    AND (p_component IS NULL OR component = p_component)
    AND (p_message IS NULL OR message ILIKE '%' || p_message || '%')
    AND (p_request_id IS NULL OR request_id = p_request_id)
    AND (p_user_wallet IS NULL OR user_wallet = p_user_wallet)
    AND (p_start_date IS NULL OR timestamp >= p_start_date)
    AND (p_end_date IS NULL OR timestamp <= p_end_date)
  ORDER BY timestamp DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get logs for a specific image
CREATE OR REPLACE FUNCTION get_logs_for_image(
  p_image_id INTEGER,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  log_id INTEGER,
  level TEXT,
  component TEXT,
  message TEXT,
  data JSONB,
  context JSONB,
  environment TEXT,
  request_id TEXT,
  user_wallet TEXT,
  timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- First, find all related request IDs for this image
  -- from both system_logs and transactions
  WITH image_requests AS (
    -- Get request IDs directly related to the image from logs
    SELECT DISTINCT request_id
    FROM system_logs
    WHERE 
      (data::TEXT ILIKE '%"imageId":' || p_image_id || '%' OR
       data::TEXT ILIKE '%"image_id":' || p_image_id || '%' OR
       context::TEXT ILIKE '%"imageId":' || p_image_id || '%' OR
       context::TEXT ILIKE '%"image_id":' || p_image_id || '%')
      
    UNION
      
    -- Get request IDs from transactions for this image
    SELECT DISTINCT s.request_id
    FROM system_logs s
    JOIN transactions t ON 
      s.data::TEXT ILIKE '%' || t.transaction_hash || '%' OR
      s.context::TEXT ILIKE '%' || t.transaction_hash || '%'
    WHERE t.image_id = p_image_id
  )
  
  -- Return all logs for those request IDs
  RETURN QUERY
  SELECT sl.*
  FROM system_logs sl
  JOIN image_requests ir ON sl.request_id = ir.request_id
  ORDER BY sl.timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get all logs for a specific transaction
CREATE OR REPLACE FUNCTION get_logs_for_transaction(
  p_transaction_hash TEXT,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  log_id INTEGER,
  level TEXT,
  component TEXT,
  message TEXT,
  data JSONB,
  context JSONB,
  environment TEXT,
  request_id TEXT,
  user_wallet TEXT,
  timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM system_logs
  WHERE 
    data::TEXT ILIKE '%' || p_transaction_hash || '%' OR
    context::TEXT ILIKE '%' || p_transaction_hash || '%' OR
    message ILIKE '%' || p_transaction_hash || '%'
  ORDER BY timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get logs with errors during a specific time period
CREATE OR REPLACE FUNCTION get_recent_errors(
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  log_id INTEGER,
  level TEXT,
  component TEXT,
  message TEXT,
  data JSONB,
  context JSONB,
  environment TEXT,
  request_id TEXT,
  user_wallet TEXT,
  timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM system_logs
  WHERE 
    level = 'ERROR' AND
    timestamp >= (CURRENT_TIMESTAMP - (p_hours || ' hours')::INTERVAL)
  ORDER BY timestamp DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get error statistics by component
CREATE OR REPLACE FUNCTION get_error_stats(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  component TEXT,
  error_count BIGINT,
  first_seen TIMESTAMP WITH TIME ZONE,
  last_seen TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    component,
    COUNT(*) AS error_count,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen
  FROM system_logs
  WHERE 
    level = 'ERROR' AND
    timestamp >= (CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL)
  GROUP BY component
  ORDER BY error_count DESC;
END;
$$ LANGUAGE plpgsql;