ALTER TABLE `attendancePolicies` ADD `analysisShiftStart` time DEFAULT '09:00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendancePolicies` ADD `analysisShiftEnd` time DEFAULT '17:00:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `attendancePolicies` ADD `analysisTargetScore` int DEFAULT 90 NOT NULL;