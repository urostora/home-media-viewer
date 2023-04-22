-- AlterTable
ALTER TABLE `File` ADD COLUMN `thumbnailProcessedAt` DATETIME(3) NULL,
    ADD COLUMN `thumbnailStatus` ENUM('New', 'Processed', 'NotSupported', 'Error') NOT NULL DEFAULT 'New';
