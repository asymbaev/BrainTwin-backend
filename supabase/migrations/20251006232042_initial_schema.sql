-- supabase/migrations/XXXXX_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  
  -- Core user state
  main_struggle TEXT NOT NULL, -- "procrastination", "focus", "stress", etc.
  rewire_progress NUMERIC DEFAULT 0 CHECK (rewire_progress >= 0 AND rewire_progress <= 100),
  current_streak INTEGER DEFAULT 0,
  skill_level TEXT DEFAULT 'foggy' CHECK (skill_level IN ('foggy', 'beginner', 'developing', 'proficient', 'rewired')),
  
  -- Twin personalization
  twin_personality JSONB DEFAULT '{"tone": "supportive", "intensity": "medium"}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CONVERSATIONS TABLE (Brain Twin Chat)
-- ============================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  user_message TEXT NOT NULL,
  twin_response TEXT NOT NULL,
  
  -- For context window management
  tokens_used INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast user queries
CREATE INDEX idx_conversations_user_id ON conversations(user_id, created_at DESC);

-- ============================================
-- PROTOCOLS TABLE (Daily Hacks)
-- ============================================
CREATE TABLE protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Protocol content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps JSONB NOT NULL, -- Array of {instruction, durationSeconds, type}
  duration_seconds INTEGER NOT NULL,
  neuroscience_explanation TEXT,
  
  -- Completion tracking
  completed_at TIMESTAMP WITH TIME ZONE,
  skipped BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  assigned_for_date DATE DEFAULT CURRENT_DATE
);

-- Index for finding user's protocols
CREATE INDEX idx_protocols_user_id ON protocols(user_id, assigned_for_date DESC);
CREATE INDEX idx_protocols_completed ON protocols(user_id, completed_at DESC) WHERE completed_at IS NOT NULL;

-- ============================================
-- REWIRE_EVENTS TABLE (For meter calculations)
-- ============================================
CREATE TABLE rewire_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL CHECK (event_type IN ('protocol_completed', 'streak_extended', 'level_up', 'streak_broken')),
  
  -- Event data
  old_value NUMERIC,
  new_value NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rewire_events_user ON rewire_events(user_id, created_at DESC);

-- ============================================
-- CACHED_PROTOCOLS TABLE (For offline support)
-- ============================================
CREATE TABLE cached_protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  cache_for_date DATE NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, cache_for_date)
);

-- ============================================
-- USER_PREFERENCES TABLE
-- ============================================
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification settings
  daily_reminder_time TIME DEFAULT '09:00:00',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  
  -- UI preferences
  theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
  haptics_enabled BOOLEAN DEFAULT TRUE,
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewire_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cached_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users: can only see their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Conversations: users see only their conversations
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Protocols: users see only their protocols
CREATE POLICY "Users can view own protocols" ON protocols
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own protocols" ON protocols
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own protocols" ON protocols
  FOR UPDATE USING (auth.uid() = user_id);

-- Rewire events: users see only their events
CREATE POLICY "Users can view own rewire events" ON rewire_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rewire events" ON rewire_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Cached protocols: users see only their cache
CREATE POLICY "Users can view own cached protocols" ON cached_protocols
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own cached protocols" ON cached_protocols
  FOR ALL USING (auth.uid() = user_id);

-- User preferences: users manage only their preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Trigger for user_preferences table
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Function to create user preferences on user creation
CREATE OR REPLACE FUNCTION create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_preferences (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_user_preferences_trigger
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_preferences();