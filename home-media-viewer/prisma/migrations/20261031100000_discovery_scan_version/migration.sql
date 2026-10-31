-- Preserve existing queue progress. A missing scan identity safely restarts its
-- cursors on the next selected scan, without altering media state.
ALTER TABLE `DiscoveryDirectory` ADD COLUMN `scanVersion` VARCHAR(64) NULL;
