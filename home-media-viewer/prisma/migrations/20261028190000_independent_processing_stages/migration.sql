-- Additive rollout: preserve all existing values, statuses and timestamps.
ALTER TABLE `File`
    ADD COLUMN `thumbnailProcessingError` TEXT NULL,
    ADD COLUMN `sourceVersion` VARCHAR(64) NULL,
    ADD COLUMN `metadataSourceVersion` VARCHAR(64) NULL,
    ADD COLUMN `thumbnailSourceVersion` VARCHAR(64) NULL;

-- Historical metadata has no reliable ownership information. Do not infer its origin.
ALTER TABLE `FileMeta`
    ADD COLUMN `origin` ENUM('Legacy', 'Extracted', 'Manual') NOT NULL DEFAULT 'Legacy';
