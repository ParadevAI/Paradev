import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const usageWidgetAppearances = sqliteTable(
	"usage_widget_appearances",
	{
		organizationId: text("organization_id").notNull(),
		hostId: text("host_id").notNull(),
		accountId: text("account_id").notNull(),
		color: text("color"),
		label: text("label"),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.organizationId, table.hostId, table.accountId],
		}),
	],
);
