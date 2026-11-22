CREATE TABLE "aws_marketplace_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_arn" text NOT NULL,
	"aws_account_id" text NOT NULL,
	"customer_identifier" text,
	"product_code" text NOT NULL,
	"agreement_id" text,
	"organization_id" uuid,
	"linked_by_user_id" uuid,
	"linked_at" timestamp,
	"claim_token_hash" text,
	"claim_expires_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"plan_id" text,
	"seats" integer,
	"entitlement_expires_at" timestamp,
	"entitlements_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aws_marketplace_customers" ADD CONSTRAINT "aws_marketplace_customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "auth"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aws_marketplace_customers" ADD CONSTRAINT "aws_marketplace_customers_linked_by_user_id_users_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "aws_marketplace_customers_license_arn_unique" ON "aws_marketplace_customers" USING btree ("license_arn");--> statement-breakpoint
CREATE UNIQUE INDEX "aws_marketplace_customers_organization_id_unique" ON "aws_marketplace_customers" USING btree ("organization_id") WHERE "aws_marketplace_customers"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "aws_marketplace_customers_claim_token_hash_unique" ON "aws_marketplace_customers" USING btree ("claim_token_hash");--> statement-breakpoint
CREATE INDEX "aws_marketplace_customers_aws_account_id_idx" ON "aws_marketplace_customers" USING btree ("aws_account_id");