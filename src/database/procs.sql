

-- Check area availability for image placement
CREATE OR REPLACE FUNCTION check_area_availability(
    p_x INTEGER,
    p_y INTEGER,
    p_width INTEGER,
    p_height INTEGER,
    p_exclude_image_id integer DEFAULT NULL
)
RETURNS TABLE (
    is_available BOOLEAN,
    conflicting_images integer[]
) AS $$
BEGIN
    RETURN QUERY
    WITH overlapping_images AS (
        SELECT image_id
        FROM images
        WHERE status = 'CONFIRMED'
        AND (image_id != p_exclude_image_id OR p_exclude_image_id IS NULL)
        AND box(point(x, y), point(x + width, y + height)) &&
            box(point(p_x, p_y), point(p_x + p_width, p_y + p_height))
    )
    SELECT 
        CASE WHEN COUNT(*) = 0 THEN true ELSE false END as is_available,
        ARRAY_AGG(image_id) as conflicting_images
    FROM overlapping_images;
END;
$$ LANGUAGE plpgsql;

-- Update image payment status
CREATE OR REPLACE FUNCTION update_image_payment_status(
    p_image_id integer,
    p_new_status VARCHAR(20),
    p_tx_id VARCHAR(88) DEFAULT NULL,
    p_signature VARCHAR(88) DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    updated_image_id integer,
    previous_status VARCHAR(20)
) AS $$
DECLARE
    v_previous_status VARCHAR(20);
BEGIN
    -- Get current status
    SELECT status INTO v_previous_status
    FROM images
    WHERE image_id = p_image_id;
    
    -- Update image status
    UPDATE images
    SET 
        status = p_new_status,
        updated_at = NOW(),
        payment_attempts = CASE 
            WHEN p_new_status IN ('PENDING', 'PROCESSING') THEN payment_attempts + 1 
            ELSE payment_attempts 
        END
    WHERE image_id = p_image_id
    AND status != 'CONFIRMED';  -- Don't update if already confirmed
    
    -- If transaction details provided, record them
    IF p_tx_id IS NOT NULL THEN
        INSERT INTO transaction_records (
            tx_id,
            image_id,
            sender_wallet,
            amount,
            status,
            signature,
            confirmed_at
        )
        SELECT 
            p_tx_id,
            p_image_id,
            sender_wallet,
            cost,
            p_new_status,
            p_signature,
            CASE 
                WHEN p_new_status = 'CONFIRMED' THEN NOW()
                ELSE NULL 
            END
        FROM images
        WHERE image_id = p_image_id;
    END IF;
    
    RETURN QUERY
    SELECT 
        true as success,
        'Status updated successfully' as message,
        p_image_id as updated_image_id,
        v_previous_status;
END;
$$ LANGUAGE plpgsql;

-- Create a function to find an image at a given position
CREATE OR REPLACE FUNCTION find_image_at_position(
  x_pos INTEGER,
  y_pos INTEGER
) RETURNS SETOF images AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM images
  WHERE status IN ('CONFIRMED', 'PENDING', 'PROCESSING')
    AND start_position_x <= x_pos
    AND (start_position_x + size_x) > x_pos
    AND start_position_y <= y_pos
    AND (start_position_y + size_y) > y_pos
  ORDER BY created_at DESC -- Get the most recent one if multiple
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
