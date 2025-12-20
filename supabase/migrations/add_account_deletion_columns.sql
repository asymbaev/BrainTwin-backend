-- Add account deletion tracking columns to users table

-- Add account_status column (enum: active, pending_deletion, deleted)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'pending_deletion', 'deleted'));

-- Add deletion_requested_at timestamp
ALTER TABLE users
ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

-- Create index for efficient cron job queries
CREATE INDEX IF NOT EXISTS idx_users_pending_deletion
ON users (account_status, deletion_requested_at)
WHERE account_status = 'pending_deletion';

-- Add comment for documentation
COMMENT ON COLUMN users.account_status IS 'Account status: active, pending_deletion (14-day grace period), or deleted';
COMMENT ON COLUMN users.deletion_requested_at IS 'Timestamp when user requested account deletion. Account will be permanently deleted 14 days after this date.';
