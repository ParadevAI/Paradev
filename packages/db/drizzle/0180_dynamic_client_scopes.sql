DROP INDEX "plugin_oauth_clients_issuer_redirect_unique";--> statement-breakpoint
ALTER TABLE "plugin_oauth_clients" ADD COLUMN "scopes" text[];--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "oauth_client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_oauth_clients_issuer_redirect_client_unique" ON "plugin_oauth_clients" USING btree ("issuer","redirect_uri","client_id");