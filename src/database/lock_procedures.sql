-- src/database/lock_procedures.sql
-- Procedures to handle database locking for concurrent image placement operations

-- Create a new table to store area locks
CREATE TABLE IF NOT EXISTS area_locks (
  lock_id SERIAL PRIMARY KEY,
  area_x INTEGER NOT NULL,
  area_y INTEGER NOT NULL,
  area_width INTEGER NOT NULL,
  area_height INTEGER NOT NULL,
  locked_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_area_locks_active ON area_locks(is_active);
CREATE INDEX IF NOT EXISTS idx_area_locks_coords ON area_locks(area_x, area_y);
CREATE INDEX IF NOT EXISTS idx_area_locks_expires ON area_locks(expires_at);

-- Create a function to check if an area is available (not locked and not overlapping with images)
CREATE OR REPLACE FUNCTION check_area_availability(
  x_pos INTEGER,
  y_pos INTEGER,
  width INTEGER,
  height INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  is_available BOOLEAN;
  lock_count INTEGER;
  image_count INTEGER;
BEGIN
  -- Remove the problematic transaction isolation level setting
  -- This will use the default isolation level of the database
  
  -- Check if the area is currently locked
  SELECT COUNT(*) INTO lock_count
  FROM area_locks
  WHERE is_active = TRUE
    AND expires_at > NOW()
    AND (
      (area_x < (x_pos + width) AND (area_x + area_width) > x_pos) AND
      (area_y < (y_pos + height) AND (area_y + area_height) > y_pos)
    );
    
  -- If there are active locks overlapping this area, it's not available
  IF lock_count > 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Check if the area overlaps with any confirmed or pending images
  SELECT COUNT(*) INTO image_count
  FROM images
  WHERE image_status IN (1, 2, 6) -- CONFIRMED, PENDING_PAYMENT, PAYMENT_RETRY
    AND (
      (start_position_x < (x_pos + width) AND (start_position_x + size_x) > x_pos) AND
      (start_position_y < (y_pos + height) AND (start_position_y + size_y) > y_pos)
    );
    
  -- If there are images in this area, it's not available
  IF image_count > 0 THEN
    RETURN FALSE;
  END IF;
  
  -- Area is available
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create a function to lock an area for a specific operation
CREATE OR REPLACE FUNCTION lock_area(
  x_pos INTEGER,
  y_pos INTEGER,
  width INTEGER,
  height INTEGER,
  lock_owner TEXT,
  lock_duration_seconds INTEGER DEFAULT 60
) RETURNS INTEGER AS $$
DECLARE
  new_lock_id INTEGER;
  is_available BOOLEAN;
BEGIN
  -- First check if the area is available
  SELECT check_area_availability(x_pos, y_pos, width, height) INTO is_available;
  
  -- If area is not available, return 0 (no lock acquired)
  IF NOT is_available THEN
    RETURN 0;
  END IF;
  
  -- Create a new lock
  INSERT INTO area_locks (
    area_x,
    area_y,
    area_width,
    area_height,
    locked_by,
    expires_at
  ) VALUES (
    x_pos,
    y_pos,
    width,
    height,
    lock_owner,
    NOW() + (lock_duration_seconds * INTERVAL '1 second')
  ) RETURNING lock_id INTO new_lock_id;
  
  -- Return the lock ID
  RETURN new_lock_id;
END;
$$ LANGUAGE plpgsql;

-- Create a function to release a lock
CREATE OR REPLACE FUNCTION release_lock(
  id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  UPDATE area_locks
  SET is_active = FALSE
  WHERE lock_id = id
    AND is_active = TRUE
  RETURNING 1 INTO rows_updated;
  
  -- Return true if a lock was released, false otherwise
  RETURN rows_updated IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Create a function to force release expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_locks() RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  UPDATE area_locks
  SET is_active = FALSE
  WHERE is_active = TRUE
    AND expires_at < NOW()
  RETURNING COUNT(*) INTO cleaned_count;
  
  RETURN cleaned_count;
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
  WHERE image_status IN (1, 2, 6) -- CONFIRMED, PENDING_PAYMENT, PAYMENT_RETRY
    AND start_position_x <= x_pos
    AND (start_position_x + size_x) > x_pos
    AND start_position_y <= y_pos
    AND (start_position_y + size_y) > y_pos
  ORDER BY created_at DESC -- Get the most recent one if multiple
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to clean up expired locks every minute
SELECT cron.schedule(
  'cleanup-expired-locks',  -- unique identifier for this cron job
  '* * * * *',            -- cron expression (every minute)
  'SELECT cleanup_expired_locks()'
);

COMMENT ON FUNCTION check_area_availability IS 'Checks if an area is available for placing an image (not locked and not overlapping with other images)';
COMMENT ON FUNCTION lock_area IS 'Locks an area for a specific operation, preventing race conditions';
COMMENT ON FUNCTION release_lock IS 'Releases a previously acquired lock';
COMMENT ON FUNCTION cleanup_expired_locks IS 'Cleans up expired locks';
COMMENT ON FUNCTION find_image_at_position IS 'Finds an image at a specific position on the canvas';

-- Grant execute permissions to the application user
GRANT EXECUTE ON FUNCTION check_area_availability TO authenticated;
GRANT EXECUTE ON FUNCTION lock_area TO authenticated;
GRANT EXECUTE ON FUNCTION release_lock TO authenticated;
GRANT EXECUTE ON FUNCTION find_image_at_position TO authenticated;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON area_locks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE area_locks_lock_id_seq TO authenticated;
