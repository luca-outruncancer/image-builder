
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