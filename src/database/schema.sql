-- src/database/schema.sql
-- Database schema for the Image Builder application

-- Images table to store metadata about uploaded images
CREATE TABLE IF NOT EXISTS images (
  image_id SERIAL PRIMARY KEY,
  image_location TEXT NOT NULL,
  start_position_x INTEGER NOT NULL,
  start_position_y INTEGER NOT NULL,
  size_x INTEGER NOT NULL,
  size_y INTEGER NOT NULL,
  image_status INTEGER NOT NULL DEFAULT 2, -- Default: PENDING_PAYMENT (2)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  payment_attempts INTEGER DEFAULT 0,
  payment_final_status INTEGER, -- Final status ID if payment failed
  user_wallet TEXT -- Optional: The wallet that created this image
);

-- Transactions table to store payment transactions
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id SERIAL PRIMARY KEY,
  image_id INTEGER NOT NULL REFERENCES images(image_id),
  sender_wallet TEXT NOT NULL,
  recipient_wallet TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  transaction_status TEXT NOT NULL, -- 'success', 'failed', 'pending', 'timeout'
  amount NUMERIC(20, 9) NOT NULL, -- Supports up to 9 decimal places for crypto
  token TEXT NOT NULL, -- Currency: 'SOL', 'USDC', etc.
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  blockchain_confirmation BOOLEAN DEFAULT FALSE,
  last_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Add constraints
  CONSTRAINT unique_transaction_hash UNIQUE (transaction_hash)
);

-- Create index on image_id for faster transaction lookups
CREATE INDEX IF NOT EXISTS idx_transactions_image_id ON transactions(image_id);

-- Create index on sender_wallet for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_transactions_sender_wallet ON transactions(sender_wallet);

-- Create index on image status for faster filtering
CREATE INDEX IF NOT EXISTS idx_images_status ON images(image_status);

-- Add comments for documentation
COMMENT ON TABLE images IS 'Stores metadata for images placed on the canvas';
COMMENT ON COLUMN images.image_status IS 'Status codes: 1=CONFIRMED, 2=PENDING_PAYMENT, 3=PAYMENT_FAILED, 4=PAYMENT_TIMEOUT, 5=NOT_INITIATED, 6=PAYMENT_RETRY';

COMMENT ON TABLE transactions IS 'Stores payment transaction records for image placements';
COMMENT ON COLUMN transactions.amount IS 'Transaction amount with 9 decimal places precision for cryptocurrency';

-- Create a view for active images (confirmed or pending)
CREATE OR REPLACE VIEW active_images AS
SELECT *
FROM images
WHERE image_status IN (1, 2, 6) -- CONFIRMED, PENDING_PAYMENT, PAYMENT_RETRY
ORDER BY created_at DESC;

-- Create a function to update image status to timeout after 24 hours
CREATE OR REPLACE FUNCTION update_timed_out_payments()
RETURNS void AS $$
BEGIN
  UPDATE images
  SET 
    image_status = 4, -- PAYMENT_TIMEOUT
    last_updated_at = CURRENT_TIMESTAMP
  WHERE 
    image_status IN (2, 6) -- PENDING_PAYMENT, PAYMENT_RETRY
    AND created_at < (CURRENT_TIMESTAMP - INTERVAL '24 hours');
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old pending images (if needed)
CREATE OR REPLACE FUNCTION cleanup_old_pending_images(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM images
  WHERE 
    image_status IN (3, 4, 5) -- PAYMENT_FAILED, PAYMENT_TIMEOUT, NOT_INITIATED
    AND created_at < (CURRENT_TIMESTAMP - (days_old || ' days')::INTERVAL)
  RETURNING COUNT(*) INTO deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
