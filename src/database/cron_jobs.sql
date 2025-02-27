-- Supabase cron jobs for the Image Builder application

/*
This file contains SQL that creates a scheduled function to:
1. Check for pending payments that have timed out
2. Mark abandoned images as "payment not initiated"
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
  WHERE image_status = 2  -- pending payment
    AND created_at < NOW() - INTERVAL '2 minutes'
    AND image_id NOT IN (
      SELECT image_id FROM transactions 
      WHERE transaction_status = 'success'
    );
    
  -- Set status=5 (payment not initiated/abandoned) for pending payments 
  -- older than 24 hours with no transaction record at all
  UPDATE images
  SET image_status = 5
  WHERE image_status = 2  -- pending payment
    AND created_at < NOW() - INTERVAL '24 hours'
    AND image_id NOT IN (
      SELECT image_id FROM transactions
    );
END;
$$;

-- Then, use Supabase's pg_cron extension to schedule this function
-- This runs every 5 minutes
SELECT cron.schedule(
  'payment-timeout-check',  -- unique identifier for this cron job
  '*/5 * * * *',          -- cron expression (every 5 minutes)
  'SELECT handle_payment_timeouts()'
);

/*
To install this in Supabase:

1. Enable the pg_cron extension in your Supabase project
   - Go to Database > Extensions
   - Search for "pg_cron" and enable it

2. Run this SQL file in the Supabase SQL Editor

3. Verify the scheduled job by querying:
   SELECT * FROM cron.job;

Note: The pg_cron extension is only available in paid Supabase plans.
For free plans, you might need to use an external scheduler or 
handle this in your application logic.
*/
