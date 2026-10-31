import {
	boolean,
	foreignKey,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";

export const pluginInstalls = pgTable(
	"plugin_installs",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		marketplace: text().notNull(),
		pluginName: text("plugin_name").notNull(),
		version: text().notNull(),
		manifest: jsonb().notNull(),

		enabled: boolean().notNull().default(true),

		organizationPluginId: uuid("organization_plugin_id").references(
			() => organizationPlugins.id,
			{ onDelete: "cascade" },
		),

		installedAt: timestamp("installed_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_installs_user_plugin_unique").on(
			table.userId,
			table.marketplace,
			table.pluginName,
		),
		index("plugin_installs_user_idx").on(table.userId),
		index("plugin_installs_organization_plugin_idx").on(
			table.organizationPluginId,
		),
	],
);

export type InsertPluginInstall = typeof pluginInstalls.$inferInsert;
export type SelectPluginInstall = typeof pluginInstalls.$inferSelect;

export const pluginMarketplaces = pgTable(
	"plugin_marketplaces",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id").references(() => organizations.id, {
			onDelete: "cascade",
		}),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		sourceKind: text("source_kind").notNull(),
		repo: text(),
		ref: text(),
		path: text(),

		addedAt: timestamp("added_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_marketplaces_user_name_unique").on(
			table.userId,
			table.name,
		),
		index("plugin_marketplaces_user_idx").on(table.userId),
	],
);

export type InsertPluginMarketplace = typeof pluginMarketplaces.$inferInsert;
export type SelectPluginMarketplace = typeof pluginMarketplaces.$inferSelect;

export const organizationPluginSources = pgTable(
	"organization_plugin_sources",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),

		repo: text().notNull(),
		ref: text(),
		path: text().notNull().default(""),

		syncedSha: text("synced_sha"),
		syncedAt: timestamp("synced_at"),
		syncError: text("sync_error"),
		syncProblems: jsonb("sync_problems")
			.$type<{ name: string; reason: string }[]>()
			.notNull()
			.default([]),

		addedByUserId: uuid("added_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("organization_plugin_sources_organization_repo_path_unique").on(
			table.organizationId,
			table.repo,
			table.path,
		),
		unique("organization_plugin_sources_id_organization_unique").on(
			table.id,
			table.organizationId,
		),
	],
);

export type InsertOrganizationPluginSource =
	typeof organizationPluginSources.$inferInsert;
export type SelectOrganizationPluginSource =
	typeof organizationPluginSources.$inferSelect;

/** Per role: "unavailable", "available" or "installed"; a missing role is unavailable. */
type InstallPolicy = Partial<
	Record<
		"owner" | "admin" | "member",
		"unavailable" | "available" | "installed"
	>
>;

export const organizationPlugins = pgTable(
	"organization_plugins",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		sourceId: uuid("source_id"),

		name: text().notNull(),
		version: text().notNull(),
		manifest: jsonb().notNull(),
		/** SHA-256 of the plugin's bundle, which is also its R2 key. */
		contentHash: text("content_hash").notNull(),
		/** The plugin directory's git blob hashes, modes and paths; an equal one means its files did not change. */
		sourceFingerprint: text("source_fingerprint"),

		installPolicy: jsonb("install_policy")
			.$type<InstallPolicy>()
			.notNull()
			.default({}),
		removedFromSourceAt: timestamp("removed_from_source_at"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("organization_plugins_organization_name_unique").on(
			table.organizationId,
			table.name,
		),
		index("organization_plugins_source_idx").on(table.sourceId),
		// A plugin can only come from a source of its own organization.
		foreignKey({
			name: "organization_plugins_source_organization_fk",
			columns: [table.sourceId, table.organizationId],
			foreignColumns: [
				organizationPluginSources.id,
				organizationPluginSources.organizationId,
			],
		}).onDelete("cascade"),
	],
);

export type InsertOrganizationPlugin = typeof organizationPlugins.$inferInsert;
export type SelectOrganizationPlugin = typeof organizationPlugins.$inferSelect;

export const pluginOauthClients = pgTable(
	"plugin_oauth_clients",
	{
		id: uuid().primaryKey().defaultRandom(),

		issuer: text().notNull(),
		redirectUri: text("redirect_uri").notNull(),

		clientId: text("client_id").notNull(),
		clientSecret: text("client_secret"),
		clientSecretExpiresAt: timestamp("client_secret_expires_at"),

		registrationAccessToken: text("registration_access_token"),
		registrationClientUri: text("registration_client_uri"),

		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),

		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at")
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex("plugin_oauth_clients_issuer_redirect_unique").on(
			table.issuer,
			table.redirectUri,
		),
	],
);

export type InsertPluginOauthClient = typeof pluginOauthClients.$inferInsert;
export type SelectPluginOauthClient = typeof pluginOauthClients.$inferSelect;
