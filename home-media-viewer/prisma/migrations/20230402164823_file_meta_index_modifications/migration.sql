/*
  Warnings:

  - A unique constraint covering the columns `[fileId,metaKey]` on the table `FileMeta` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `FileMeta_metaKey_dateValue_idx` ON `FileMeta`;

-- DropIndex
DROP INDEX `FileMeta_metaKey_floatValue_idx` ON `FileMeta`;

-- DropIndex
DROP INDEX `FileMeta_metaKey_intValue_idx` ON `FileMeta`;

-- DropIndex
DROP INDEX `FileMeta_metaKey_latitude_idx` ON `FileMeta`;

-- DropIndex
DROP INDEX `FileMeta_metaKey_longitude_idx` ON `FileMeta`;

-- CreateIndex
CREATE INDEX `FileMeta_fileId_metaKey_idx` ON `FileMeta`(`fileId`, `metaKey`);

-- CreateIndex
CREATE UNIQUE INDEX `FileMeta_fileId_metaKey_key` ON `FileMeta`(`fileId`, `metaKey`);
