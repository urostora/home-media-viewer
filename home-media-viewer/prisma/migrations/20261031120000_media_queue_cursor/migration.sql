-- Lazy, scope-specific fairness cursors. Do not enqueue or alter existing media.
CREATE TABLE `MediaQueueCursor` (
    `id` VARCHAR(64) NOT NULL,
    `lastFileId` VARCHAR(191) NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
