-- Discovery starts lazily; preserve all existing files, relationships and media state.
CREATE TABLE `DiscoveryDirectory` (
    `id` VARCHAR(64) NOT NULL,
    `path` TEXT NOT NULL,
    `entryCursor` TEXT NULL,
    `cleanupCursor` VARCHAR(191) NULL,
    `lastServedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `DiscoveryDirectory_lastServedAt_id_idx` (`lastServedAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
