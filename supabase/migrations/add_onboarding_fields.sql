-- Migration: Add onboarding fields to users table
-- Run this in Supabase SQL Editor

-- Add new columns for onboarding
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS goal TEXT,
ADD COLUMN IF NOT EXISTS biggest_struggle TEXT,
ADD COLUMN IF NOT EXISTS preferred_time TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Update existing users to have onboarding completed (so they don't see it again)
UPDATE users 
SET onboarding_completed = TRUE 
WHERE onboarding_completed IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON users(onboarding_completed);

-- Verify changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('goal', 'biggest_struggle', 'preferred_time', 'onboarding_completed');