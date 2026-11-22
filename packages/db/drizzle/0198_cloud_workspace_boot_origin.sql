CREATE TYPE "public"."cloud_workspace_boot_origin" AS ENUM('create', 'wake', 'adopt');--> statement-breakpoint
ALTER TABLE "cloud_workspace_boots" ADD COLUMN "origin" "cloud_workspace_boot_origin";