-- Database schema for Image Builder application

-- Images table - Stores image placement and status information
CREATE TABLE images (
  image_id SERIAL PRIMARY KEY,
  image_location VARCHAR NOT NULL,
  start_position_x INTEGER NOT NULL,
  start_position_y INTEGER NOT NULL,
  size_x INTEGER NOT NULL,
  size_y INTEGER NOT NULL,
  image_status INTEGER NOT NULL DEFAULT 2, -- Default to pending payment
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP WITH TIME ZONE
);

-- Status codes reference:
-- 1 = confirmed (payment successful)
-- 2 = pending payment
-- 3 = payment failed
-- 4 = payment timeout
-- 5 = payment not initiated or abandoned

-- Add indexes for efficient queries
CREATE INDEX idx_images_status ON images(image_status);
CREATE INDEX idx_images_created_at ON images(created_at);

-- Transactions table - Stores payment transaction information
CREATE TABLE transactions (
  transaction_id SERIAL PRIMARY KEY,
  image_id INTEGER REFERENCES images(image_id),
  sender_wallet VARCHAR NOT NULL,
  recipient_wallet VARCHAR NOT NULL,
  transaction_hash VARCHAR NOT NULL,
  transaction_status VARCHAR NOT NULL,
  amount NUMERIC NOT NULL,
  token VARCHAR NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for efficient queries
CREATE INDEX idx_transactions_image_id ON transactions(image_id);
CREATE INDEX idx_transactions_sender_wallet ON transactions(sender_wallet);
CREATE INDEX idx_transactions_transaction_hash ON transactions(transaction_hash);

-- Comments to help with schema understanding
COMMENT ON TABLE images IS 'Stores information about images placed on the canvas';
COMMENT ON COLUMN images.image_status IS '1=confirmed, 2=pending payment, 3=payment failed, 4=payment timeout, 5=payment not initiated';

COMMENT ON TABLE transactions IS 'Stores information about Solana payment transactions';
COMMENT ON COLUMN transactions.transaction_status IS 'Status of the transaction: success, failed, etc.';
