-- AlterTable
ALTER TABLE `File` ADD COLUMN `metadataProcessingError` TEXT NULL,
    MODIFY `metadataStatus` ENUM('New', 'Processed', 'NotSupported', 'Error') NOT NULL DEFAULT 'New';
