CREATE TABLE `LoginBudget` (
    `key` VARCHAR(64) NOT NULL,
    `used` INTEGER NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `resetAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`key`),
    INDEX `LoginBudget_resetAt_idx`(`resetAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LoginPermit` (
    `slot` INTEGER NOT NULL,
    `owner` VARCHAR(191) NULL,
    `acquiredAt` DATETIME(3) NULL,
    PRIMARY KEY (`slot`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `LoginBudget` (`key`, `used`, `startedAt`, `resetAt`) VALUES ('global', 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
INSERT INTO `LoginPermit` (`slot`, `owner`, `acquiredAt`) VALUES (0, NULL, NULL), (1, NULL, NULL);
