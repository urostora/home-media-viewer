-- AlterTable
ALTER TABLE `File` ADD COLUMN `thumbnailProcessedAt` DATETIME(3) NULL DEFAULT NULL,
    ADD COLUMN `thumbnailStatus` ENUM('New', 'Processed', 'NotSupported', 'Error') NULL DEFAULT 'New';
