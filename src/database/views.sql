-- Recent logs view
CREATE OR REPLACE VIEW recent_logs AS
SELECT *
FROM application_logs
WHERE ttimestamp >= NOW() - INTERVAL '24 hours'
ORDER BY ttimestamp DESC;

-- Log summary by component and level
CREATE OR REPLACE VIEW log_summary AS
SELECT 
    date_trunc('hour', ttimestamp) AS hour,
    component,
    level,
    COUNT(*) as count,
    COUNT(DISTINCT request_id) as unique_requests,
    COUNT(DISTINCT sender_wallet) as unique_users
FROM application_logs
WHERE ttimestamp >= NOW() - INTERVAL '24 hours'
GROUP BY hour, component, level
ORDER BY hour DESC, component, level;

-- Active images view (confirmed and paid)
CREATE OR REPLACE VIEW active_images AS
SELECT 
    i.*,
    t.tx_id,
    t.signature,
    t.confirmed_at as payment_confirmed_at
FROM images i
LEFT JOIN transaction_records t ON i.image_id = t.image_id
WHERE i.status = 'CONFIRMED'
ORDER BY i.created_at DESC;

-- Pending payments view
CREATE OR REPLACE VIEW pending_payments AS
SELECT 
    i.image_id,
    i.sender_wallet,
    i.status as image_status,
    i.payment_attempts,
    ps.session_id,
    ps.status as session_status,
    ps.attempt_count as session_attempts,
    ps.expires_at,
    ps.created_at as session_created_at,
    ps.last_attempt_at
FROM images i
JOIN payment_sessions ps ON i.image_id = ps.image_id
WHERE i.status IN ('INITIALIZED', 'PENDING', 'PROCESSING')
AND ps.status IN ('INITIALIZED', 'PENDING', 'PROCESSING')
AND ps.expires_at > NOW()
ORDER BY ps.created_at DESC;

-- Failed payments view
CREATE OR REPLACE VIEW failed_payments AS
SELECT 
    i.image_id,
    i.sender_wallet,
    i.status as image_status,
    i.payment_attempts,
    ps.session_id,
    ps.status as session_status,
    ps.attempt_count as session_attempts,
    ps.expires_at,
    ps.created_at as session_created_at,
    ps.last_attempt_at,
    tr.tx_id,
    tr.signature as last_signature,
    tr.created_at as transaction_created_at
FROM images i
LEFT JOIN payment_sessions ps ON i.image_id = ps.image_id
LEFT JOIN transaction_records tr ON i.image_id = tr.image_id
WHERE i.status IN ('FAILED', 'TIMEOUT', 'CANCELED')
ORDER BY i.updated_at DESC;

-- Payment statistics view
CREATE OR REPLACE VIEW payment_statistics AS
SELECT
    date_trunc('hour', created_at) as hour,
    status,
    COUNT(*) as total_count,
    COUNT(DISTINCT sender_wallet) as unique_users,
    SUM(amount) as total_amount,
    AVG(amount) as average_amount,
    MIN(amount) as min_amount,
    MAX(amount) as max_amount
FROM transaction_records
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour, status
ORDER BY hour DESC, status; 