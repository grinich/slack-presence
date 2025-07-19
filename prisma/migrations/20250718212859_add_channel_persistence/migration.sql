-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "slack_team_id" TEXT NOT NULL,
    "last_synced_at" DATETIME,
    "oldest_message_synced" DATETIME,
    "newest_message_synced" DATETIME,
    "total_messages_synced" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "last_sync_error" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_message_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "slack_message_id" TEXT NOT NULL,
    "metadata" TEXT,
    CONSTRAINT "message_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "message_logs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_message_logs" ("channel_id", "id", "metadata", "slack_message_id", "timestamp", "user_id") SELECT "channel_id", "id", "metadata", "slack_message_id", "timestamp", "user_id" FROM "message_logs";
DROP TABLE "message_logs";
ALTER TABLE "new_message_logs" RENAME TO "message_logs";
CREATE INDEX "message_logs_user_id_timestamp_idx" ON "message_logs"("user_id", "timestamp");
CREATE INDEX "message_logs_channel_id_timestamp_idx" ON "message_logs"("channel_id", "timestamp");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "channels_slack_team_id_last_synced_at_idx" ON "channels"("slack_team_id", "last_synced_at");

-- CreateIndex
CREATE INDEX "channels_slack_team_id_memberCount_idx" ON "channels"("slack_team_id", "memberCount");
