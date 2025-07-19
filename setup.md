# Slack Team Analytics Setup Guide

## Quick Start with SQLite

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
Create a `.env.local` file in the root directory:

```bash
# Database (SQLite for local development)
POSTGRES_URL="file:./dev.db"

# NextAuth.js
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here"

# Slack App Configuration (get these from your Slack app dashboard)
SLACK_CLIENT_ID="your-slack-client-id"
SLACK_CLIENT_SECRET="your-slack-client-secret"
SLACK_SIGNING_SECRET="your-slack-signing-secret"

# Cron Job Security
CRON_SECRET="your-random-secret-key"
```

### 3. Initialize the Database
```bash
npx prisma migrate dev --name init
```

### 4. Start the Development Server
```bash
npm run dev
```

### 5. Connect Your Slack Workspace
1. Visit http://localhost:3000
2. You'll be redirected to the sign-in page
3. Click "Connect with Slack"
4. Authorize the app in your Slack workspace
5. You'll be redirected back to the dashboard

### 6. Backfill Historical Data
After connecting, run the backfill script to populate 7 days of historical data:
```bash
npm run backfill
```

## What the Backfill Script Does

- ✅ Fetches all WorkOS org members (filters out bots, external users, shared channels)
- ✅ Creates user records in the database
- ✅ Collects 7 days of message history from all channels
- ✅ Infers presence data from message activity
- ✅ Populates timeline visualizations with real data

## Troubleshooting

### Database Issues
If you get database errors, try:
```bash
npx prisma db push
```

### Slack App Issues
Make sure your Slack app has these OAuth scopes:
- `users:read`
- `users:read.email`
- `channels:read`
- `channels:history`
- `groups:read`
- `groups:history`
- `team:read`
- `users.profile:read`

### Environment Variables
Generate a random secret for `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

## Moving to Production

Later, you can easily switch to a cloud database by:
1. Creating a PostgreSQL database (Supabase, Neon, etc.)
2. Updating `POSTGRES_URL` in your environment
3. Running `npx prisma migrate deploy`
4. Deploying to Vercel with the same environment variables

The app will automatically start collecting presence data every minute once deployed!