-- Migration: Add receipt-based authentication fields
-- Run this in Supabase SQL Editor

-- Add receipt authentication columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS original_transaction_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS has_subscribed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive';

-- Create index for fast receipt lookups
CREATE INDEX IF NOT EXISTS idx_users_original_transaction_id 
ON users(original_transaction_id);

-- Create index for subscription status queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_status 
ON users(subscription_status);

-- Update existing premium users to have subscription status
UPDATE users 
SET subscription_status = 'active',
    has_subscribed = TRUE
WHERE is_premium = TRUE
AND subscription_status IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.original_transaction_id IS 'Apple StoreKit original transaction ID for receipt-based authentication';
COMMENT ON COLUMN users.has_subscribed IS 'Whether user has ever had a paid subscription';
COMMENT ON COLUMN users.subscription_status IS 'Current subscription status: active, inactive, expired, cancelled';

-- Verify changes
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('original_transaction_id', 'has_subscribed', 'subscription_status');

-- Show sample of updated data structure
SELECT 
    id,
    email,
    name,
    original_transaction_id,
    is_premium,
    has_subscribed,
    subscription_status,
    created_at
FROM users
LIMIT 5;