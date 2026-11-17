import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * A person's account-wide settings, the same on every device and readable by
 * the server. No row means the defaults.
 */
export const userSettings = pgTable("user_settings", {
	userId: uuid("user_id")
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	experimentalChat: boolean("experimental_chat").notNull().default(false),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export type SelectUserSettings = typeof userSettings.$inferSelect;
