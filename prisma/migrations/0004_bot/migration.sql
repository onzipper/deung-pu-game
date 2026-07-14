-- 0004_bot — Bot (Hunter Assistant) persistence: tier entitlement + profiles + sessions/reports.
-- Source of truth: D-063 (tier caps/prices/retention) · P3 Bot UI spec §13/§15 · P2B §6.
-- MariaDB-compatible — VARCHAR(191) / CHAR(36) / DATETIME(3) / JSON / utf8mb4_unicode_ci, mirroring 0003.
-- Hand-authored (NOT `prisma migrate dev` against a live DB). Apply order: after 0003_progression.
-- Standalone tables (no FOREIGN KEY — same posture as the progression tables): app-layer integrity.
-- ⛔ never-downgrade zone: bots write the audited economy — treat like the ledger/progression tables.

-- CreateTable
CREATE TABLE `bot_tier_state` (
    `account_id` CHAR(36) NOT NULL,
    `tier` VARCHAR(191) NOT NULL DEFAULT 'free',
    `pass_expires_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_profiles` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `map_id` VARCHAR(191) NOT NULL,
    `pocket_id` VARCHAR(191) NOT NULL,
    `rules_json` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bot_profiles_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bot_sessions` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `character_id` CHAR(36) NOT NULL,
    `profile_id` CHAR(36) NOT NULL,
    `map_id` VARCHAR(191) NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `stopped_at` DATETIME(3) NULL,
    `stop_reason` VARCHAR(191) NULL,
    `kill_count` INTEGER NOT NULL DEFAULT 0,
    `gold_earned` INTEGER NOT NULL DEFAULT 0,
    `exp_earned` INTEGER NOT NULL DEFAULT 0,
    `drops_json` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `bot_sessions_account_id_started_at_idx`(`account_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
