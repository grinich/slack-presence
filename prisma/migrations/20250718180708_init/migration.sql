-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slack_user_id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatar_url" TEXT,
    "slack_access_token" TEXT,
    "slack_team_id" TEXT,
    "timezone" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "presence_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "metadata" TEXT,
    CONSTRAINT "presence_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "slack_message_id" TEXT NOT NULL,
    "metadata" TEXT,
    CONSTRAINT "message_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "total_active_minutes" INTEGER NOT NULL,
    "total_messages" INTEGER NOT NULL,
    "first_active_time" DATETIME,
    "last_active_time" DATETIME,
    "peak_activity_hour" INTEGER,
    "metadata" TEXT,
    CONSTRAINT "daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_slack_user_id_key" ON "users"("slack_user_id");

-- CreateIndex
CREATE INDEX "presence_logs_user_id_timestamp_idx" ON "presence_logs"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "message_logs_user_id_timestamp_idx" ON "message_logs"("user_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_user_id_date_key" ON "daily_summaries"("user_id", "date");
