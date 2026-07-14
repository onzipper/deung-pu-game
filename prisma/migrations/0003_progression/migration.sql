-- 0003_progression — C1 milestone runtime + C2/B4 schema-ahead tables.
-- Source of truth: Economy §18.2 (milestone one-time per account) · ACHIEVEMENT spec §4.2 (achievement progress)
--                  · Reinforcement §4.2 / D-064 (account-per-boss pity).
-- MariaDB-compatible — VARCHAR(191) / CHAR(36) / DATETIME(3) / utf8mb4_unicode_ci, mirroring 0001_init.
-- Hand-authored (NOT `prisma migrate dev` against a live DB). Apply order: after 0002_shop_ledger_reasons.
-- Standalone tables (no FOREIGN KEY — same posture as accounts.last_played_character_id): app-layer integrity.

-- CreateTable
CREATE TABLE `milestone_grants` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `character_id` CHAR(36) NOT NULL,
    `milestone_id` VARCHAR(191) NOT NULL,
    `granted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `milestone_grants_account_id_milestone_id_key`(`account_id`, `milestone_id`),
    INDEX `milestone_grants_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `achievement_progress` (
    `id` VARCHAR(191) NOT NULL,
    `scope_key` VARCHAR(191) NOT NULL,
    `achievement_id` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'locked',
    `current_value` INTEGER NOT NULL DEFAULT 0,
    `distinct_keys` JSON NULL,
    `streak_value` INTEGER NOT NULL DEFAULT 0,
    `idempotency_key` VARCHAR(191) NULL,
    `claimed_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `achievement_progress_scope_key_achievement_id_key`(`scope_key`, `achievement_id`),
    INDEX `achievement_progress_scope_key_idx`(`scope_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reinforcement_pity` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `boss_id` VARCHAR(191) NOT NULL,
    `pity_count` INTEGER NOT NULL DEFAULT 0,
    `fragment_count` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `reinforcement_pity_account_id_boss_id_key`(`account_id`, `boss_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
