# Slack Team Analytics

A modern web application for monitoring your team's Slack activity and presence patterns.

## Features

- **Real-time presence tracking**: Monitor when team members are online/offline
- **Activity analytics**: Track messaging patterns and engagement
- **Team overview dashboard**: Get insights into team productivity
- **Individual user stats**: Detailed breakdown per team member
- **Automated data collection**: Continuous monitoring via cron jobs

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **UI Components**: Radix UI primitives
- **Database**: PostgreSQL with Prisma ORM
- **Slack Integration**: Slack Web API & OAuth
- **Deployment**: Vercel with cron jobs

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd slack-presence/app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   # Database
   POSTGRES_URL="your-postgres-connection-string"
   
   # Slack OAuth (get from https://api.slack.com/apps)
   SLACK_CLIENT_ID="your-client-id"
   SLACK_CLIENT_SECRET="your-client-secret"
   SLACK_SIGNING_SECRET="your-signing-secret"
   SLACK_BOT_TOKEN="your-bot-token"
   
   # NextAuth
   NEXTAUTH_SECRET="your-secret-key"
   NEXTAUTH_URL="http://localhost:3000"
   ```

4. **Set up the database**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

## Slack App Setup

1. Go to [Slack API Apps](https://api.slack.com/apps)
2. Create a new app "From scratch"
3. Configure OAuth & Permissions with these scopes:
   - `users:read`
   - `users:read.email`
   - `channels:read`
   - `groups:read`
   - `im:read`
   - `mpim:read`
4. Install the app to your workspace
5. Copy the Bot User OAuth Token to your `.env` file

## API Endpoints

- `GET /api/dashboard/stats` - Get team analytics data
- `POST /api/sync/users` - Sync Slack users to database
- `POST /api/collect/presence` - Collect current presence data
- `GET /api/cron/collect-presence` - Cron job for automated collection

## Deployment

1. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

2. **Set up environment variables** in Vercel dashboard

3. **Configure database** (use Vercel Postgres or external provider)

4. **Run database migrations**
   ```bash
   npx prisma migrate deploy
   ```

The cron job will automatically start collecting presence data every minute.

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npx prisma studio` - Open database GUI
- `npx prisma migrate dev` - Create and run migrations

## License

MIT