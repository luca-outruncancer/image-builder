-- Supabase cron jobs for the Image Builder application

/*
This file contains SQL that creates scheduled functions to:
1. Check for pending payments that have timed out
2. Mark abandoned images as "payment not initiated"
3. Clean up old system logs based on retention policy
*/

-- First, create the function that will mark timed out payments
CREATE OR REPLACE FUNCTION handle_payment_timeouts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set status=4 (payment timeout) for pending payments older than 2 minutes 
  -- that don't have a successful transaction
  UPDATE images
  SET image_status = 4
  WHERE image_status in (2,6)  -- pending payment or payment retry
    AND created_at < NOW() - INTERVAL '2 minutes'
    AND image_id NOT IN (
      SELECT image_id FROM transactions 
      WHERE transaction_status = 'success'
    );
    
  -- Set status=5 (payment not initiated/abandoned) for pending payments 
  -- older than 2 minutes hours with no transaction record at all
  UPDATE images
  SET image_status = 5
  WHERE image_status = 2  -- pending payment
    AND created_at < NOW() - INTERVAL '2 minutes'
    AND image_id NOT IN (
      SELECT image_id FROM transactions
    );
    
  -- Log this operation
  PERFORM log_application_event(
    'INFO',
    'CRON',
    'Handled payment timeouts',
    jsonb_build_object(
      'updated_count', (SELECT COUNT(*) FROM images WHERE image_status IN (4, 5) AND last_updated_at > NOW() - INTERVAL '1 minute')
    ),
    NULL,
    CASE 
      WHEN current_setting('app.environment', true) IS NULL THEN 'development'
      ELSE current_setting('app.environment', true)
    END
  );
END;
$$;

-- Create a function to clean up old logs based on retention policy (30 days)
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
  retention_days INTEGER := 30; -- Hardcoded 30-day retention
  retention_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate the retention cutoff date
  retention_date := NOW() - (retention_days * INTERVAL '1 day');
  
  -- Count how many logs we'll delete for logging purposes
  SELECT COUNT(*) INTO deleted_count 
  FROM system_logs 
  WHERE timestamp < retention_date;
  
  -- Log the cleanup operation (before we delete the logs)
  IF deleted_count > 0 THEN
    PERFORM log_application_event(
      'INFO',
      'CRON',
      'Cleaning up old system logs',
      jsonb_build_object(
        'retention_days', retention_days,
        'logs_to_delete', deleted_count,
        'retention_date', retention_date
      ),
      NULL,
      CASE 
        WHEN current_setting('app.environment', true) IS NULL THEN 'development'
        ELSE current_setting('app.environment', true)
      END
    );
  END IF;
  
  -- Delete logs older than the retention period
  DELETE FROM system_logs 
  WHERE timestamp < retention_date;
  
  -- Get accurate count of deleted rows
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Schedule the payment timeout function to run every 5 minutes
SELECT cron.schedule(
  'payment-timeout-check',  -- unique identifier for this cron job
  '*/5 * * * *',          -- cron expression (every 5 minutes)
  'SELECT handle_payment_timeouts()'
);

-- Schedule the log cleanup function to run daily at 3:00 AM
SELECT cron.schedule(
  'system-logs-cleanup',   -- unique identifier for this cron job
  '0 3 * * *',            -- cron expression (3:00 AM every day)
  'SELECT cleanup_old_system_logs()'
);

/*
To install this in Supabase:

1. Enable the pg_cron extension in your Supabase project
   - Go to Database > Extensions
   - Search for "pg_cron" and enable it

2. Run this SQL file in the Supabase SQL Editor

3. Verify the scheduled jobs by querying:
   SELECT * FROM cron.job;

Note: The pg_cron extension is only available in paid Supabase plans.
For free plans, you might need to use an external scheduler or 
handle this in your application logic.
*/
