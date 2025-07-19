-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_channels" (
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
    "last_sync_cursor" TEXT,
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "last_sync_error" TEXT,
    "topic" TEXT,
    "purpose" TEXT,
    "slack_created_at" DATETIME,
    "creator_user_id" TEXT,
    "is_general" BOOLEAN NOT NULL DEFAULT false,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "last_activity_at" DATETIME,
    "last_activity_user_id" TEXT,
    "last_activity_preview" TEXT,
    "metadata" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_channels" ("created_at", "id", "isArchived", "isPrivate", "last_sync_cursor", "last_sync_error", "last_synced_at", "memberCount", "metadata", "name", "newest_message_synced", "oldest_message_synced", "slack_team_id", "syncStatus", "total_messages_synced", "updated_at") SELECT "created_at", "id", "isArchived", "isPrivate", "last_sync_cursor", "last_sync_error", "last_synced_at", "memberCount", "metadata", "name", "newest_message_synced", "oldest_message_synced", "slack_team_id", "syncStatus", "total_messages_synced", "updated_at" FROM "channels";
DROP TABLE "channels";
ALTER TABLE "new_channels" RENAME TO "channels";
CREATE INDEX "channels_slack_team_id_last_synced_at_idx" ON "channels"("slack_team_id", "last_synced_at");
CREATE INDEX "channels_slack_team_id_memberCount_idx" ON "channels"("slack_team_id", "memberCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
