-- AlterTable
ALTER TABLE `File` ADD COLUMN `isDirectory` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `parentFileId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `File` ADD CONSTRAINT `File_parentFileId_fkey` FOREIGN KEY (`parentFileId`) REFERENCES `File`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
