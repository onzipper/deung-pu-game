-- CreateTable
CREATE TABLE `accounts` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(191) NULL,
    `email_normalized` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NULL,
    `upgraded_at` DATETIME(3) NULL,
    `is_guest` BOOLEAN NOT NULL DEFAULT true,
    `display_name` VARCHAR(191) NULL,
    `character_slots` INTEGER NOT NULL DEFAULT 5,
    `storage_capacity` INTEGER NOT NULL DEFAULT 200,
    `last_played_character_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `accounts_email_key`(`email`),
    UNIQUE INDEX `accounts_email_normalized_key`(`email_normalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `characters` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `class_id` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `exp` BIGINT NOT NULL DEFAULT 0,
    `stats` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `characters_name_key`(`name`),
    INDEX `characters_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `character_state` (
    `character_id` CHAR(36) NOT NULL,
    `map_id` VARCHAR(191) NOT NULL,
    `tx` DOUBLE NOT NULL,
    `ty` DOUBLE NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`character_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `item_instances` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `character_id` CHAR(36) NULL,
    `item_id` VARCHAR(191) NOT NULL,
    `location` ENUM('CHARACTER_INVENTORY', 'CHARACTER_EQUIPMENT', 'ACCOUNT_STORAGE', 'DELIVERY_BOX', 'MARKET_ESCROW', 'WORLD_LOOT', 'DESTROYED') NOT NULL DEFAULT 'CHARACTER_INVENTORY',
    `location_ref` VARCHAR(191) NULL,
    `slot` INTEGER NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `enhancement_level` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NULL,
    `unique_equip_group` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `item_instances_account_id_location_idx`(`account_id`, `location`),
    INDEX `item_instances_character_id_idx`(`character_id`),
    INDEX `item_instances_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currency_ledger` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `character_id` CHAR(36) NOT NULL,
    `currency` ENUM('gold', 'mark', 'diamond') NOT NULL,
    `amount` BIGINT NOT NULL,
    `reason` ENUM('drop', 'quest_reward', 'market_sale', 'market_purchase', 'market_tax', 'enhancement_cost', 'trade', 'admin_adjustment', 'purchase_topup', 'compensation') NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `currency_ledger_idempotency_key_key`(`idempotency_key`),
    INDEX `currency_ledger_character_id_currency_idx`(`character_id`, `currency`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enhancement_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `character_id` CHAR(36) NOT NULL,
    `item_instance_id` CHAR(36) NOT NULL,
    `before_level` INTEGER NOT NULL,
    `after_level` INTEGER NOT NULL,
    `result` ENUM('success', 'fail', 'downgrade', 'crack') NOT NULL,
    `rng_roll` DOUBLE NOT NULL,
    `config_version` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `enhancement_logs_character_id_idx`(`character_id`),
    INDEX `enhancement_logs_item_instance_id_idx`(`item_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `drop_audit` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `character_id` CHAR(36) NOT NULL,
    `mob_type` VARCHAR(191) NOT NULL,
    `drop_table_version` INTEGER NOT NULL,
    `rng_roll` DOUBLE NOT NULL,
    `result_item_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `drop_audit_character_id_idx`(`character_id`),
    INDEX `drop_audit_mob_type_idx`(`mob_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `delivery_box_entries` (
    `id` CHAR(36) NOT NULL,
    `account_id` CHAR(36) NOT NULL,
    `source` ENUM('compensation', 'gm_gift', 'event_reward', 'achievement_reward', 'market_purchase', 'paid_item', 'campaign_gift', 'migrated_recovery') NOT NULL,
    `payload` JSON NOT NULL,
    `claim_status` VARCHAR(191) NOT NULL DEFAULT 'unclaimed',
    `expires_at` DATETIME(3) NULL,
    `claimed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `delivery_box_entries_account_id_claim_status_idx`(`account_id`, `claim_status`),
    INDEX `delivery_box_entries_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storage_transaction_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `account_id` CHAR(36) NOT NULL,
    `character_id` CHAR(36) NULL,
    `action` ENUM('deposit', 'withdraw', 'claim_to_inventory', 'claim_to_storage') NOT NULL,
    `item_instance_id` CHAR(36) NULL,
    `item_id` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `from_location` ENUM('CHARACTER_INVENTORY', 'CHARACTER_EQUIPMENT', 'ACCOUNT_STORAGE', 'DELIVERY_BOX', 'MARKET_ESCROW', 'WORLD_LOOT', 'DESTROYED') NOT NULL,
    `to_location` ENUM('CHARACTER_INVENTORY', 'CHARACTER_EQUIPMENT', 'ACCOUNT_STORAGE', 'DELIVERY_BOX', 'MARKET_ESCROW', 'WORLD_LOOT', 'DESTROYED') NOT NULL,
    `ref_type` VARCHAR(191) NULL,
    `ref_id` VARCHAR(191) NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `storage_transaction_log_idempotency_key_key`(`idempotency_key`),
    INDEX `storage_transaction_log_account_id_idx`(`account_id`),
    INDEX `storage_transaction_log_item_instance_id_idx`(`item_instance_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_lease` (
    `account_id` CHAR(36) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `character_id` CHAR(36) NULL,
    `server_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `heartbeat_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`account_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_versions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `payload` JSON NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `config_versions_key_active_idx`(`key`, `active`),
    UNIQUE INDEX `config_versions_key_version_key`(`key`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `game_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `event_id` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(191) NOT NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `server_id` VARCHAR(191) NULL,
    `account_id` CHAR(36) NULL,
    `character_id` CHAR(36) NULL,
    `session_id` VARCHAR(191) NULL,
    `map_id` VARCHAR(191) NULL,
    `room_id` VARCHAR(191) NULL,
    `channel_id` VARCHAR(191) NULL,
    `party_id` VARCHAR(191) NULL,
    `guild_id` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `source_version` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `game_events_event_id_key`(`event_id`),
    INDEX `game_events_event_type_occurred_at_idx`(`event_type`, `occurred_at`),
    INDEX `game_events_occurred_at_idx`(`occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `characters` ADD CONSTRAINT `characters_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `character_state` ADD CONSTRAINT `character_state_character_id_fkey` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_instances` ADD CONSTRAINT `item_instances_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_instances` ADD CONSTRAINT `item_instances_character_id_fkey` FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `item_instances` ADD CONSTRAINT `item_instances_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `delivery_box_entries` ADD CONSTRAINT `delivery_box_entries_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `storage_transaction_log` ADD CONSTRAINT `storage_transaction_log_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_lease` ADD CONSTRAINT `session_lease_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

