-- AlterTable
ALTER TABLE `File` MODIFY `metadataStatus` ENUM('New', 'Processed', 'NotSupported') NOT NULL DEFAULT 'New';
