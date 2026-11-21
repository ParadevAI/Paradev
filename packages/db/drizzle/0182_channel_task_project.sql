ALTER TABLE "channels" ADD COLUMN "task_project_id" uuid;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_task_project_id_task_projects_id_fk" FOREIGN KEY ("task_project_id") REFERENCES "public"."task_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channels_task_project_idx" ON "channels" USING btree ("task_project_id");