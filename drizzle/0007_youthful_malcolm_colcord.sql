ALTER TABLE `deliveryZones` ADD `slaWarningMinutes` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `kpiDefinitions` ADD `ownerEmployeeId` int;--> statement-breakpoint
ALTER TABLE `kpiDefinitions` ADD `direction` enum('higher_better','lower_better') DEFAULT 'higher_better' NOT NULL;--> statement-breakpoint
ALTER TABLE `kpiDefinitions` ADD CONSTRAINT `kpiDefinitions_ownerEmployeeId_employees_id_fk` FOREIGN KEY (`ownerEmployeeId`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;