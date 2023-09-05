-- AlterTable
ALTER TABLE `File`
    MODIFY COLUMN `thumbnailStatus` ENUM('New', 'Processed', 'NotSupported', 'Error') NOT NULL DEFAULT 'New';
