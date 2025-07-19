-- Slack Presence Database Schema
-- Run this in your Supabase SQL editor to create the required tables

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "slack_user_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatar_url" TEXT,
    "slack_access_token" TEXT,
    "slack_team_id" TEXT,
    "timezone" TEXT,
    "metadata" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presence_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,

    CONSTRAINT "presence_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "total_active_minutes" INTEGER NOT NULL,
    "first_active_time" TIMESTAMP(3),
    "last_active_time" TIMESTAMP(3),
    "peak_activity_hour" INTEGER,
    "metadata" TEXT,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_user_id_key" ON "users"("slack_user_id");

-- CreateIndex
CREATE INDEX "users_slack_team_id_idx" ON "users"("slack_team_id");

-- CreateIndex
CREATE INDEX "users_metadata_idx" ON "users"("metadata");

-- CreateIndex
CREATE INDEX "users_slack_access_token_idx" ON "users"("slack_access_token");

-- CreateIndex
CREATE INDEX "presence_logs_user_id_timestamp_idx" ON "presence_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "presence_logs_timestamp_idx" ON "presence_logs"("timestamp");

-- CreateIndex
CREATE INDEX "presence_logs_status_idx" ON "presence_logs"("status");

-- CreateIndex
CREATE INDEX "presence_logs_user_id_status_idx" ON "presence_logs"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_user_id_date_key" ON "daily_summaries"("user_id", "date");

-- AddForeignKey
ALTER TABLE "presence_logs" ADD CONSTRAINT "presence_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();