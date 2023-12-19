/*
  Warnings:

  - You are about to drop the column `albumId` on the `File` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `File` DROP FOREIGN KEY `File_albumId_fkey`;

-- AlterTable
ALTER TABLE `Album` ADD COLUMN `parentAlbumId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `_AlbumFiles` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_AlbumFiles_AB_unique`(`A`, `B`),
    INDEX `_AlbumFiles_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Album` ADD CONSTRAINT `Album_parentAlbumId_fkey` FOREIGN KEY (`parentAlbumId`) REFERENCES `Album`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AlbumFiles` ADD CONSTRAINT `_AlbumFiles_A_fkey` FOREIGN KEY (`A`) REFERENCES `Album`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AlbumFiles` ADD CONSTRAINT `_AlbumFiles_B_fkey` FOREIGN KEY (`B`) REFERENCES `File`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- migrate File-Album relation
INSERT INTO `_AlbumFiles` (`A`, `B`)
SELECT `albumId`, `id`
FROM `File`;

-- Remove old albumId
ALTER TABLE `File` DROP COLUMN `albumId`;

-- set file path to full path, related to albums root directory
UPDATE `File`
JOIN `_AlbumFiles` as af ON af.`B` = `File`.`id`  
JOIN `Album` as a ON af.`A` = a.`id`
SET `File`.`path` = CONCAT(REPLACE(a.`basePath`, '/mnt/albums/', ''), '/', `File`.`path`);