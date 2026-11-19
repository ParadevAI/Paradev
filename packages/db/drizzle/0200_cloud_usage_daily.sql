CREATE TABLE "cloud_usage_daily" (
	"organization_id" uuid NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid,
	"vcpus" integer NOT NULL,
	"gb_minutes" numeric NOT NULL,
	"seconds" numeric NOT NULL,
	"events" integer NOT NULL,
	CONSTRAINT "cloud_usage_daily_key" UNIQUE NULLS NOT DISTINCT("organization_id","day","user_id","vcpus")
);
