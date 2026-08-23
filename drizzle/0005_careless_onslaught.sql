CREATE TABLE `deliveryProofImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryOrderId` int NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`mimeType` varchar(96) NOT NULL,
	`caption` varchar(500),
	`uploadedByEmployeeId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deliveryProofImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliveryZones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(32),
	`description` text,
	`slaMinutes` int NOT NULL DEFAULT 60,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deliveryZones_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_zone_branch_name_unique` UNIQUE(`branchId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `deliveryZoneId` int;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `slaDueAt` timestamp;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD `slaAlertedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deliveryProofImages` ADD CONSTRAINT `deliveryProofImages_deliveryOrderId_deliveryOrders_id_fk` FOREIGN KEY (`deliveryOrderId`) REFERENCES `deliveryOrders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryProofImages` ADD CONSTRAINT `deliveryProofImages_uploadedByEmployeeId_employees_id_fk` FOREIGN KEY (`uploadedByEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryZones` ADD CONSTRAINT `deliveryZones_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `delivery_proof_order_time_idx` ON `deliveryProofImages` (`deliveryOrderId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `delivery_zone_branch_active_idx` ON `deliveryZones` (`branchId`,`isActive`);--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_deliveryZoneId_deliveryZones_id_fk` FOREIGN KEY (`deliveryZoneId`) REFERENCES `deliveryZones`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `delivery_orders_sla_due_idx` ON `deliveryOrders` (`branchId`,`slaDueAt`);