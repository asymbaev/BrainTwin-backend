-- Add audio URL columns to daily_tasks
ALTER TABLE daily_tasks
ADD COLUMN audio_page1_url TEXT,
ADD COLUMN audio_page2_url TEXT,
ADD COLUMN audio_page3_url TEXT,
ADD COLUMN audio_voice TEXT DEFAULT 'nova';