import { usageWidgetAppearances } from "@superset/local-db/schema/usage-widget-appearances";
import { and, eq, inArray } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { z } from "zod";

const MAX_APPEARANCES_PER_HOST = 5_000;
const OPAQUE_IDENTITY = /^[a-f0-9]{64}$/;
const ACCOUNT_ID = /^(?:claude|codex|grok|agy|opencode):[a-f0-9]{64}$/;
const scopeSchema = z.string().min(1).max(200);
export const widgetAppearancePatchSchema = z
	.object({
		color: z
			.string()
			.regex(/^#[0-9a-f]{6}$/i)
			.transform((value) => value.toUpperCase())
			.nullable()
			.optional(),
		label: z
			.string()
			.trim()
			.max(80)
			.refine((value) =>
				Array.from(value).every((character) => {
					const code = character.charCodeAt(0);
					return code >= 32 && (code < 127 || code > 159);
				}),
			)
			.transform((value) => value || null)
			.nullable()
			.optional(),
	})
	.strict();

export type WidgetAppearance = { color: string | null; label: string | null };
export interface WidgetAppearanceInventory {
	accounts: readonly {
		id: string;
		quotaIdentity?: string;
		status: string;
	}[];
	complete: boolean;
	fresh: boolean;
}

type AppearanceDatabase = Pick<
	BaseSQLiteDatabase<"sync", unknown>,
	"select" | "insert" | "delete"
>;

export function createWidgetAppearanceStore({
	db,
	getOrganizationId,
	getInventory,
	now = Date.now,
}: {
	db: AppearanceDatabase;
	getOrganizationId: () => string | null;
	getInventory: (hostId: string) => WidgetAppearanceInventory | null;
	now?: () => number;
}) {
	const scope = (hostId: string) => {
		const organizationId = scopeSchema.parse(getOrganizationId());
		scopeSchema.parse(hostId);
		return {
			organizationId,
			hostId,
			where: and(
				eq(usageWidgetAppearances.organizationId, organizationId),
				eq(usageWidgetAppearances.hostId, hostId),
			),
		};
	};
	const rows = (where: ReturnType<typeof and>) =>
		db.select().from(usageWidgetAppearances).where(where).all();
	const verified = (account: WidgetAppearanceInventory["accounts"][number]) =>
		account.status === "ok" &&
		typeof account.quotaIdentity === "string" &&
		OPAQUE_IDENTITY.test(account.quotaIdentity) &&
		ACCOUNT_ID.test(account.id) &&
		account.id.endsWith(`:${account.quotaIdentity}`);

	return {
		readWidgetAppearances(hostId: string): Record<string, WidgetAppearance> {
			const result: Record<string, WidgetAppearance> = {};
			for (const row of rows(scope(hostId).where)) {
				result[row.accountId] = { color: row.color, label: row.label };
			}
			return result;
		},
		writeWidgetAppearance(
			hostId: string,
			accountId: string,
			patch: z.input<typeof widgetAppearancePatchSchema>,
		): void {
			const currentScope = scope(hostId);
			const inventory = getInventory(hostId);
			const account = inventory?.accounts.find(
				(value) => value.id === accountId,
			);
			if (!inventory?.fresh || !account || !verified(account)) {
				throw new Error("The usage account identity is not verified");
			}
			const values = widgetAppearancePatchSchema.parse(patch);
			const saved = rows(currentScope.where);
			const previous = saved.find((row) => row.accountId === accountId);
			const color =
				values.color === undefined ? (previous?.color ?? null) : values.color;
			const label =
				values.label === undefined ? (previous?.label ?? null) : values.label;
			if (color === null && label === null) {
				db.delete(usageWidgetAppearances)
					.where(
						and(
							currentScope.where,
							eq(usageWidgetAppearances.accountId, accountId),
						),
					)
					.run();
				return;
			}
			if (!previous && saved.length >= MAX_APPEARANCES_PER_HOST) {
				throw new Error("The usage appearance limit has been reached");
			}
			db.insert(usageWidgetAppearances)
				.values({
					organizationId: currentScope.organizationId,
					hostId,
					accountId,
					color,
					label,
					updatedAt: now(),
				})
				.onConflictDoUpdate({
					target: [
						usageWidgetAppearances.organizationId,
						usageWidgetAppearances.hostId,
						usageWidgetAppearances.accountId,
					],
					set: { color, label, updatedAt: now() },
				})
				.run();
		},
		pruneWidgetAppearances(hostId: string): number {
			const currentScope = scope(hostId);
			const inventory = getInventory(hostId);
			if (
				!inventory?.complete ||
				!inventory.fresh ||
				!inventory.accounts.every(verified)
			) {
				return 0;
			}
			const present = new Set(inventory.accounts.map((account) => account.id));
			const absent = rows(currentScope.where)
				.filter((row) => !present.has(row.accountId))
				.map((row) => row.accountId);
			if (absent.length === 0) return 0;
			return db
				.delete(usageWidgetAppearances)
				.where(
					and(
						currentScope.where,
						inArray(usageWidgetAppearances.accountId, absent),
					),
				)
				.returning({ accountId: usageWidgetAppearances.accountId })
				.all().length;
		},
	};
}
