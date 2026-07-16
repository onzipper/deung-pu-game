-- 0005_bot_checkpoint — Bot durable restart resume: one checkpoint row per account (PR6a).
-- Source of truth: D-067 (Pro-only restart resume) · checkpoint v15.5 §4.1–4.2 · Runtime Bot doc §0.0.
-- MariaDB-compatible — CHAR(36) / VARCHAR(191) / DATETIME(3) / JSON / utf8mb4_unicode_ci, mirroring 0004.
-- Hand-authored (NOT `prisma migrate dev` against a live DB). Apply order: after 0004_bot.
-- Standalone table (no FOREIGN KEY — same posture as 0004): app-layer integrity.
-- ⛔ never-downgrade zone: the bot writes the audited economy — treat like the ledger/progression tables.

-- CreateTable
CREATE TABLE `bot_checkpoints` (
    `account_id` CHAR(36) NOT NULL,
    `id` CHAR(36) NOT NULL,
    `character_id` CHAR(36) NOT NULL,
    `profile_id` CHAR(36) NOT NULL,
    `source_session_id` CHAR(36) NOT NULL,
    `map_id` VARCHAR(191) NOT NULL,
    `pocket_id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL,
    `continuity_json` JSON NOT NULL,
    `workflow_json` JSON NULL,
    `saved_at` DATETIME(3) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
