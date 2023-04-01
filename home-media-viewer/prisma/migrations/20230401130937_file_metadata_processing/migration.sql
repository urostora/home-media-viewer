-- AlterTable
ALTER TABLE `File` ADD COLUMN `metadataProcessedAt` DATETIME(3) NULL,
    ADD COLUMN `metadataStatus` ENUM('New', 'Processed') NOT NULL DEFAULT 'New',
    MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `modifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `size` INTEGER NULL;
