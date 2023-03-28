-- AlterTable
ALTER TABLE `Album` MODIFY `status` ENUM('Deleted', 'Active', 'Disabled') NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE `File` MODIFY `status` ENUM('Deleted', 'Active', 'Disabled') NOT NULL DEFAULT 'Active';

-- AlterTable
ALTER TABLE `User` MODIFY `status` ENUM('Deleted', 'Active', 'Disabled') NOT NULL DEFAULT 'Active';
