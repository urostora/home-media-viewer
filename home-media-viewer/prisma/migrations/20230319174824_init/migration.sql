-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('Deleted', 'Active') NOT NULL DEFAULT 'Active',
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Album` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('Deleted', 'Active') NOT NULL DEFAULT 'Active',
    `name` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('File', 'Ftp') NOT NULL,
    `connectionString` TEXT NOT NULL,
    `basePath` TEXT NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `File` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('Deleted', 'Active') NOT NULL DEFAULT 'Active',
    `path` TEXT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `extension` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `modifiedAt` DATETIME(3) NOT NULL,
    `size` INTEGER NOT NULL,
    `hash` VARCHAR(191) NULL,
    `albumId` VARCHAR(191) NOT NULL,

    INDEX `File_extension_idx`(`extension`),
    INDEX `File_name_extension_idx`(`name`, `extension`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FileMeta` (
    `id` VARCHAR(191) NOT NULL,
    `fileId` VARCHAR(191) NOT NULL,
    `metaKey` VARCHAR(191) NOT NULL,
    `type` ENUM('Int', 'Float', 'String', 'DateTime', 'Location') NOT NULL,
    `intValue` INTEGER NULL,
    `floatValue` DOUBLE NULL,
    `stringValue` TEXT NULL,
    `dateValue` DATETIME(3) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,

    INDEX `FileMeta_fileId_idx`(`fileId`),
    INDEX `FileMeta_metaKey_idx`(`metaKey`),
    INDEX `FileMeta_metaKey_intValue_idx`(`metaKey`, `intValue`),
    INDEX `FileMeta_metaKey_floatValue_idx`(`metaKey`, `floatValue`),
    INDEX `FileMeta_metaKey_dateValue_idx`(`metaKey`, `dateValue`),
    INDEX `FileMeta_metaKey_latitude_idx`(`metaKey`, `latitude`),
    INDEX `FileMeta_metaKey_longitude_idx`(`metaKey`, `longitude`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_AlbumToUser` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_AlbumToUser_AB_unique`(`A`, `B`),
    INDEX `_AlbumToUser_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `File` ADD CONSTRAINT `File_albumId_fkey` FOREIGN KEY (`albumId`) REFERENCES `Album`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FileMeta` ADD CONSTRAINT `FileMeta_fileId_fkey` FOREIGN KEY (`fileId`) REFERENCES `File`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AlbumToUser` ADD CONSTRAINT `_AlbumToUser_A_fkey` FOREIGN KEY (`A`) REFERENCES `Album`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_AlbumToUser` ADD CONSTRAINT `_AlbumToUser_B_fkey` FOREIGN KEY (`B`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
