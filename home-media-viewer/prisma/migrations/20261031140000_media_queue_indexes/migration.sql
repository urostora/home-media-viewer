-- Sparse pending queues can seek stage status and then page by ID. Existing
-- File indexes cover paths/search/parents, not these stage predicates.
CREATE INDEX `File_status_isDirectory_metadataStatus_id_idx`
    ON `File` (`status`, `isDirectory`, `metadataStatus`, `id`);
CREATE INDEX `File_status_isDirectory_thumbnailStatus_id_idx`
    ON `File` (`status`, `isDirectory`, `thumbnailStatus`, `id`);
