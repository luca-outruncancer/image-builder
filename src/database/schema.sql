-- //src/database/schema.sql


-- Application logs table
CREATE TABLE IF NOT EXISTS application_logs (
    id SERIAL PRIMARY KEY, -- Unique identifier for each log entry
    ttimestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the log was created
    level VARCHAR(20) NOT NULL, -- Level of the log message
    component VARCHAR(50) NOT NULL, -- Component that logged the message
    message TEXT NOT NULL, -- Message to be logged
    data JSONB, -- Additional data to be logged
    context JSONB, -- Context of the log message
    environment VARCHAR(20) NOT NULL, -- Environment where the log was created
    request_id UUID NOT NULL, -- Unique identifier for the request
    sender_wallet VARCHAR(44), -- Wallet address of the sender
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    recipient_wallet VARCHAR(44) NOT NULL
);

-- Payment sessions table
CREATE TABLE IF NOT EXISTS payment_sessions (
    session_id UUID PRIMARY KEY, -- Unique identifier for each payment session
    image_id INTEGER NOT NULL REFERENCES images(image_id), -- Reference to the image that was paid for
    sender_wallet VARCHAR(44) NOT NULL, -- Wallet address of the sender
    amount DECIMAL(20,9) NOT NULL, -- Amount of the transaction
    token TEXT NOT NULL, -- Token used for the transaction
    status VARCHAR(20) NOT NULL DEFAULT 'INITIALIZED', -- Status of the payment session
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when the payment session was created
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL, -- Timestamp when the payment session will expire
    last_attempt_at TIMESTAMP WITH TIME ZONE, -- Timestamp when the last attempt was made
    attempt_count INTEGER DEFAULT 0 -- Number of attempts made for the payment session  
);

-- Indexes for application_logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON application_logs(ttimestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_component ON application_logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_request_id ON application_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_logs_sender_wallet ON application_logs(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_logs_environment ON application_logs(environment);
-- CREATE INDEX IF NOT EXISTS idx_logs_cleanup ON application_logs((timestamp < NOW() - INTERVAL '30 days'));

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

-- Indexes for payment_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_image_id ON payment_sessions(image_id);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON payment_sessions(sender_wallet);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON payment_sessions(expires_at);

-- Add table comments
COMMENT ON TABLE application_logs IS 'Stores application-wide logging information';
COMMENT ON TABLE images IS 'Stores information about placed images on the canvas';
COMMENT ON TABLE transaction_records IS 'Records of all payment transactions';
COMMENT ON TABLE payment_sessions IS 'Tracks active payment sessions and their states'; 