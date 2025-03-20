-- //src/database/schema.sql


-- Images table
CREATE TABLE IF NOT EXISTS images (
    image_id SERIAL PRIMARY KEY, -- Unique identifier for each image
    start_position_x INTEGER NOT NULL, -- X coordinate of the top-left corner of the image
    start_position_y INTEGER NOT NULL, -- Y coordinate of the top-left corner of the image
    size_x INTEGER NOT NULL, -- Width of the image
    size_y INTEGER NOT NULL, -- Height of the image
    sender_wallet VARCHAR(44) NOT NULL, -- Wallet address of the sender
    image_location TEXT NOT NULL, -- Location of the image on the filesystem or IPFS
    status VARCHAR(20) NOT NULL DEFAULT 'INITIALIZED', -- Status of the image
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the image was created
    updated_at TIMESTAMP WITH TIME ZONE, -- Timestamp when the image was last updated
    payment_attempts INTEGER DEFAULT 0
);

-- Transaction records table
CREATE TABLE IF NOT EXISTS transaction_records (
    tx_id SERIAL PRIMARY KEY, -- Unique identifier for each transaction
    image_id INTEGER NOT NULL REFERENCES images(image_id), -- Reference to the image that was paid for
    transaction_hash TEXT NOT NULL, -- Hash of the transaction
    sender_wallet TEXT NOT NULL, -- Wallet address of the sender
    token TEXT NOT NULL, -- Token used for the transaction
    amount DECIMAL(20,9) NOT NULL, -- Amount of the transaction
    status VARCHAR(20) NOT NULL, -- Status of the transaction
    signature VARCHAR(88),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the transaction was created
    confirmed_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    recipient_wallet VARCHAR(44) NOT NULL,
    unique_nonce VARCHAR(16) NOT NULL
);

-- Indexes for images
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_wallet ON images(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_images_position ON images USING gist (
    box(point(start_position_x, start_position_y), point(start_position_x + size_x, start_position_y + size_y))
);

-- Indexes for transaction_records
CREATE INDEX IF NOT EXISTS idx_tx_image_id ON transaction_records(image_id);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transaction_records(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transaction_records(status);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transaction_records(created_at);

-- Add table comments
COMMENT ON TABLE images IS 'Stores information about placed images on the canvas';
COMMENT ON TABLE transaction_records IS 'Records of all payment transactions';
