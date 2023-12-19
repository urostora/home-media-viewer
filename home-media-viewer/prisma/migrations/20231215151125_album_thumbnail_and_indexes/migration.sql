-- AlterTable
ALTER TABLE `Album` ADD COLUMN `thumbnailFileId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `File_path_idx` ON `File`(`path`(120));

-- CreateIndex
CREATE INDEX `File_contentDate_idx` ON `File`(`contentDate`);

-- CreateIndex
CREATE INDEX `FileMeta_metaKey_latitude_longitude_idx` ON `FileMeta`(`metaKey`(32), `latitude`, `longitude`);

-- AddForeignKey
ALTER TABLE `Album` ADD CONSTRAINT `Album_thumbnailFileId_fkey` FOREIGN KEY (`thumbnailFileId`) REFERENCES `File`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
