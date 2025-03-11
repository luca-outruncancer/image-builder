-- Create enums
CREATE TYPE log_level AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');
CREATE TYPE payment_status AS ENUM ('INITIALIZED', 'PENDING', 'PROCESSING', 'CONFIRMED', 'FAILED', 'TIMEOUT', 'CANCELED');

-- Application logs table
CREATE TABLE IF NOT EXISTS application_logs (
    id BIGSERIAL PRIMARY KEY,
    ttimestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    level log_level NOT NULL,
    component VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    context JSONB,
    environment VARCHAR(20) NOT NULL,
    request_id UUID NOT NULL,
    user_wallet VARCHAR(44),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Images table
CREATE TABLE IF NOT EXISTS images (
    image_id BIGINT PRIMARY KEY,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    wallet_address VARCHAR(44) NOT NULL,
    cost DECIMAL(20,9) NOT NULL,
    status payment_status NOT NULL DEFAULT 'INITIALIZED',
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE,
    payment_attempts INTEGER DEFAULT 0,
    CONSTRAINT valid_dimensions CHECK (width > 0 AND height > 0),
    CONSTRAINT valid_position CHECK (x >= 0 AND y >= 0)
);

-- Transaction records table
CREATE TABLE IF NOT EXISTS transaction_records (
    tx_id VARCHAR(88) PRIMARY KEY,
    image_id BIGINT NOT NULL REFERENCES images(image_id),
    wallet_address VARCHAR(44) NOT NULL,
    amount DECIMAL(20,9) NOT NULL,
    status payment_status NOT NULL,
    signature VARCHAR(88),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_amount CHECK (amount > 0)
);

-- Payment sessions table
CREATE TABLE IF NOT EXISTS payment_sessions (
    session_id UUID PRIMARY KEY,
    image_id BIGINT NOT NULL REFERENCES images(image_id),
    wallet_address VARCHAR(44) NOT NULL,
    amount DECIMAL(20,9) NOT NULL,
    status payment_status NOT NULL DEFAULT 'INITIALIZED',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    attempt_count INTEGER DEFAULT 0,
    CONSTRAINT valid_session_amount CHECK (amount > 0)
);

-- Indexes for application_logs
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON application_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_component ON application_logs(component);
CREATE INDEX IF NOT EXISTS idx_logs_request_id ON application_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_wallet ON application_logs(user_wallet);
CREATE INDEX IF NOT EXISTS idx_logs_environment ON application_logs(environment);
-- CREATE INDEX IF NOT EXISTS idx_logs_cleanup ON application_logs((timestamp < NOW() - INTERVAL '30 days'));

-- Indexes for images
CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_images_wallet ON images(wallet_address);
CREATE INDEX IF NOT EXISTS idx_images_confirmed ON images(confirmed) WHERE confirmed = true;
CREATE INDEX IF NOT EXISTS idx_images_position ON images USING gist (
    box(point(x, y), point(x + width, y + height))
);

-- Indexes for transaction_records
CREATE INDEX IF NOT EXISTS idx_tx_image_id ON transaction_records(image_id);
CREATE INDEX IF NOT EXISTS idx_tx_wallet ON transaction_records(wallet_address);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transaction_records(status);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transaction_records(created_at);

-- Indexes for payment_sessions
CREATE INDEX IF NOT EXISTS idx_sessions_image_id ON payment_sessions(image_id);
CREATE INDEX IF NOT EXISTS idx_sessions_wallet ON payment_sessions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON payment_sessions(expires_at);

-- Add table comments
COMMENT ON TABLE application_logs IS 'Stores application-wide logging information';
COMMENT ON TABLE images IS 'Stores information about placed images on the canvas';
COMMENT ON TABLE transaction_records IS 'Records of all payment transactions';
COMMENT ON TABLE payment_sessions IS 'Tracks active payment sessions and their states'; 