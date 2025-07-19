# Production Deployment Guide

## Quick Deploy to Vercel

### 1. Deploy to Vercel
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/grinich/slack-presence)

### 2. Set up Supabase Database

1. Go to your Supabase project: https://supabase.com/dashboard/project/bjrlawhflwfjljdufyvt
2. Go to **SQL Editor**
3. Run this command to create your tables:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  slack_user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  slack_access_token TEXT,
  slack_team_id TEXT,
  timezone TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Presence logs table  
CREATE TABLE presence_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  metadata TEXT
);

-- Daily summaries table
CREATE TABLE daily_summaries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_active_minutes INTEGER NOT NULL,
  first_active_time TIMESTAMP,
  last_active_time TIMESTAMP,
  peak_activity_hour INTEGER,
  metadata TEXT,
  UNIQUE(user_id, date)
);

-- Indexes for performance
CREATE INDEX idx_users_slack_team_id ON users(slack_team_id);
CREATE INDEX idx_users_slack_access_token ON users(slack_access_token);
CREATE INDEX idx_presence_logs_user_timestamp ON presence_logs(user_id, timestamp);
CREATE INDEX idx_presence_logs_timestamp ON presence_logs(timestamp);
CREATE INDEX idx_presence_logs_status ON presence_logs(status);
```

### 3. Configure Environment Variables in Vercel

Go to your Vercel project settings and add these environment variables:

```
DATABASE_URL = postgresql://postgres.bjrlawhflwfjljdufyvt:[YOUR_PASSWORD]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
NEXTAUTH_URL = https://your-app.vercel.app
NEXTAUTH_SECRET = [generate with: openssl rand -base64 32]
SLACK_CLIENT_ID = [from your Slack app]
SLACK_CLIENT_SECRET = [from your Slack app] 
CRON_SECRET = [generate with: openssl rand -base64 32]
```

### 4. Set up Slack App

1. Go to https://api.slack.com/apps
2. Create new app "Online (Production)"
3. OAuth & Permissions → Add these scopes:
   - Bot: `users:read`, `users:read.email`, `team:read`
   - User: `users:read`, `team:read`
4. OAuth & Permissions → Add redirect URL: `https://your-app.vercel.app/api/auth/callback/slack`
5. Install app to workspace

### 5. Deploy and Test

1. Trigger a new deployment in Vercel
2. Visit your app URL
3. Sign in with Slack
4. Check that presence data starts collecting

## Manual Database Setup

If you prefer to run Prisma migrations:

```bash
# Set DATABASE_URL in .env
npx prisma migrate deploy
npx prisma generate
```

## Troubleshooting

- Check Vercel function logs for errors
- Verify all environment variables are set
- Ensure Slack app has correct redirect URLs
- Test cron functions manually at `/api/cron/collect-presence`