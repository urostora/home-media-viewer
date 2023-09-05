-- AlterTable
ALTER TABLE `User` ADD COLUMN `isAdmin` BOOLEAN NULL DEFAULT false;

UPDATE `User` SET `isAdmin` = false;

ALTER TABLE `User` MODIFY COLUMN `isAdmin` BOOLEAN NOT NULL DEFAULT false;
