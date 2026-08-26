CREATE TABLE `orderPortalAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`phoneUsername` varchar(32) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`sessionVersion` int NOT NULL DEFAULT 1,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`lastSignedInAt` timestamp,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orderPortalAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_portal_phone_unique` UNIQUE(`phoneUsername`)
);
--> statement-breakpoint
CREATE TABLE `orderPortalStaff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`fullName` varchar(160) NOT NULL,
	`phone` varchar(32),
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orderPortalStaff_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_portal_staff_branch_name_unique` UNIQUE(`branchId`,`fullName`)
);
--> statement-breakpoint
ALTER TABLE `deliveryOrders` MODIFY COLUMN `status` enum('draft','contacted','prepared','ready','assigned','picked_up','en_route','delivered','failed','returned','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `requestedByOrderStaffId` int;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `createdByOrderAccountId` int;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `itemName` varchar(200);--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `itemCode` varchar(80);--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `quantity` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `contactedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `preparedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `cancelledAt` timestamp;--> statement-breakpoint
ALTER TABLE `orderPortalAccounts` ADD CONSTRAINT `orderPortalAccounts_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderPortalAccounts` ADD CONSTRAINT `orderPortalAccounts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderPortalStaff` ADD CONSTRAINT `orderPortalStaff_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orderPortalStaff` ADD CONSTRAINT `orderPortalStaff_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_portal_branch_active_idx` ON `orderPortalAccounts` (`branchId`,`isActive`);--> statement-breakpoint
CREATE INDEX `order_portal_staff_branch_active_idx` ON `orderPortalStaff` (`branchId`,`isActive`);--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_requestedByOrderStaffId_orderPortalStaff_id_fk` FOREIGN KEY (`requestedByOrderStaffId`) REFERENCES `orderPortalStaff`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_createdByOrderAccountId_orderPortalAccounts_id_fk` FOREIGN KEY (`createdByOrderAccountId`) REFERENCES `orderPortalAccounts`(`id`) ON DELETE set null ON UPDATE no action;