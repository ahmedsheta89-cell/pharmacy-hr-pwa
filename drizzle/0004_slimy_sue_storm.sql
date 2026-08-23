CREATE TABLE `attendancePolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`graceMinutes` int NOT NULL DEFAULT 15,
	`lateMultiplier` decimal(4,2) NOT NULL DEFAULT '1.00',
	`monthlyLateMinuteCap` int,
	`pointsPerLateOccurrence` int NOT NULL DEFAULT 0,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendancePolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_policy_branch_unique` UNIQUE(`branchId`)
);
--> statement-breakpoint
CREATE TABLE `chatConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicToken` varchar(64) NOT NULL,
	`branchId` int,
	`customerName` varchar(160) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`subject` varchar(220),
	`status` enum('open','pending','closed') NOT NULL DEFAULT 'open',
	`assignedUserId` int,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chatConversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_conversations_public_token_unique` UNIQUE(`publicToken`)
);
--> statement-breakpoint
CREATE TABLE `chatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`sender` enum('customer','agent','system') NOT NULL,
	`body` text NOT NULL,
	`authorUserId` int,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chatMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customerContactLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`conversationId` int,
	`customerPhone` varchar(32) NOT NULL,
	`channel` enum('whatsapp_link') NOT NULL,
	`body` text NOT NULL,
	`actorUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerContactLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliveryEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryOrderId` int NOT NULL,
	`actorEmployeeId` int,
	`action` enum('created','assigned','picked_up','en_route','delivered','failed','returned','cancelled','note') NOT NULL,
	`note` text,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`accuracyMeters` int,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deliveryEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliveryLocationPings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deliveryOrderId` int NOT NULL,
	`employeeId` int NOT NULL,
	`latitude` decimal(10,7) NOT NULL,
	`longitude` decimal(10,7) NOT NULL,
	`accuracyMeters` int,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deliveryLocationPings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deliveryOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`orderCode` varchar(48) NOT NULL,
	`customerName` varchar(160) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`address` text NOT NULL,
	`destinationLatitude` decimal(10,7),
	`destinationLongitude` decimal(10,7),
	`promisedAt` timestamp,
	`status` enum('draft','ready','assigned','picked_up','en_route','delivered','failed','returned','cancelled') NOT NULL DEFAULT 'draft',
	`assignedEmployeeId` int,
	`pickedUpAt` timestamp,
	`deliveredAt` timestamp,
	`proofNote` text,
	`exceptionReason` text,
	`notes` text,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deliveryOrders_id` PRIMARY KEY(`id`),
	CONSTRAINT `delivery_orders_branch_code_unique` UNIQUE(`branchId`,`orderCode`)
);
--> statement-breakpoint
CREATE TABLE `faqEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`question` varchar(300) NOT NULL,
	`answer` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faqEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quickReplies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`isActive` enum('yes','no') NOT NULL DEFAULT 'yes',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quickReplies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attendancePolicies` ADD CONSTRAINT `attendancePolicies_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendancePolicies` ADD CONSTRAINT `attendancePolicies_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chatConversations` ADD CONSTRAINT `chatConversations_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chatConversations` ADD CONSTRAINT `chatConversations_assignedUserId_users_id_fk` FOREIGN KEY (`assignedUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD CONSTRAINT `chatMessages_conversationId_chatConversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `chatConversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `chatMessages` ADD CONSTRAINT `chatMessages_authorUserId_users_id_fk` FOREIGN KEY (`authorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customerContactLogs` ADD CONSTRAINT `customerContactLogs_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customerContactLogs` ADD CONSTRAINT `customerContactLogs_conversationId_chatConversations_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `chatConversations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customerContactLogs` ADD CONSTRAINT `customerContactLogs_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryEvents` ADD CONSTRAINT `deliveryEvents_deliveryOrderId_deliveryOrders_id_fk` FOREIGN KEY (`deliveryOrderId`) REFERENCES `deliveryOrders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryEvents` ADD CONSTRAINT `deliveryEvents_actorEmployeeId_employees_id_fk` FOREIGN KEY (`actorEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryLocationPings` ADD CONSTRAINT `deliveryLocationPings_deliveryOrderId_deliveryOrders_id_fk` FOREIGN KEY (`deliveryOrderId`) REFERENCES `deliveryOrders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryLocationPings` ADD CONSTRAINT `deliveryLocationPings_employeeId_employees_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_assignedEmployeeId_employees_id_fk` FOREIGN KEY (`assignedEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deliveryOrders` ADD CONSTRAINT `deliveryOrders_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `faqEntries` ADD CONSTRAINT `faqEntries_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quickReplies` ADD CONSTRAINT `quickReplies_branchId_branches_id_fk` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `chat_conversations_status_time_idx` ON `chatConversations` (`status`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_time_idx` ON `chatMessages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `contact_logs_phone_time_idx` ON `customerContactLogs` (`customerPhone`,`createdAt`);--> statement-breakpoint
CREATE INDEX `delivery_events_order_time_idx` ON `deliveryEvents` (`deliveryOrderId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `delivery_pings_order_time_idx` ON `deliveryLocationPings` (`deliveryOrderId`,`capturedAt`);--> statement-breakpoint
CREATE INDEX `delivery_orders_branch_status_idx` ON `deliveryOrders` (`branchId`,`status`);--> statement-breakpoint
CREATE INDEX `delivery_orders_employee_status_idx` ON `deliveryOrders` (`assignedEmployeeId`,`status`);--> statement-breakpoint
CREATE INDEX `faq_branch_active_idx` ON `faqEntries` (`branchId`,`isActive`);--> statement-breakpoint
CREATE INDEX `quick_replies_branch_active_idx` ON `quickReplies` (`branchId`,`isActive`);
