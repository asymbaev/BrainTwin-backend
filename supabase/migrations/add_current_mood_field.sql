-- Migration: Add current_mood field to users table
-- This field stores the user's mood during onboarding for personalized hack generation

-- Add current_mood column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS current_mood TEXT;

-- Add comment for documentation
COMMENT ON COLUMN users.current_mood IS 'User mood during onboarding: overwhelmed, anxious, low_energy, neutral, calm, good, motivated, or inspired';

-- Create index for faster queries (optional, but useful if filtering by mood)
CREATE INDEX IF NOT EXISTS idx_users_current_mood ON users(current_mood);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name = 'current_mood';
