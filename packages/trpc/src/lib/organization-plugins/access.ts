import { db } from "@superset/db/client";
import {
	members,
	organizationPlugins,
	pluginInstalls,
} from "@superset/db/schema";
import { organizationMarketplace } from "@superset/shared/plugins";
import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

export async function memberRole(
	userId: string,
	organizationId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ role: members.role })
		.from(members)
		.where(
			and(
				eq(members.userId, userId),
				eq(members.organizationId, organizationId),
			),
		)
		.limit(1);
	return row?.role ?? null;
}

/** A plugin this role may use. One that left its repository stays with those who have it but is not offered anew. */
export async function accessiblePlugin(
	organizationId: string,
	role: string | null,
	name: string,
	{ offered = false }: { offered?: boolean } = {},
) {
	const [row] = await db
		.select()
		.from(organizationPlugins)
		.where(
			and(
				eq(organizationPlugins.organizationId, organizationId),
				eq(organizationPlugins.name, name),
				accessibleTo(role),
				offered ? isNull(organizationPlugins.removedFromSourceAt) : undefined,
			),
		)
		.limit(1);
	return row ?? null;
}

export function accessibleTo(role: string | null): SQL {
	if (!role) return sql`false`;
	return inArray(sql`${organizationPlugins.installPolicy} ->> ${role}`, [
		"available",
		"installed",
	]);
}

export function installedFor(role: string | null): SQL {
	if (!role) return sql`false`;
	return eq(sql`${organizationPlugins.installPolicy} ->> ${role}`, "installed");
}

/** Records an install for every plugin the organization installs for this member's role, so it reaches their machines and cloud workspaces like one they chose. Writes only what is missing. */
export async function ensureManagedInstalls(
	userId: string,
	organizationId: string,
): Promise<void> {
	const role = await memberRole(userId, organizationId);
	const managed = await db
		.select()
		.from(organizationPlugins)
		.where(
			and(
				eq(organizationPlugins.organizationId, organizationId),
				installedFor(role),
				isNull(organizationPlugins.removedFromSourceAt),
			),
		);
	if (!managed.length) return;
	const held = await db
		.select({ organizationPluginId: pluginInstalls.organizationPluginId })
		.from(pluginInstalls)
		.where(
			and(
				eq(pluginInstalls.userId, userId),
				inArray(
					pluginInstalls.organizationPluginId,
					managed.map((plugin) => plugin.id),
				),
			),
		);
	const heldIds = new Set(held.map((row) => row.organizationPluginId));
	const missing = managed.filter((plugin) => !heldIds.has(plugin.id));
	if (!missing.length) return;
	await db
		.insert(pluginInstalls)
		.values(
			missing.map((plugin) => ({
				userId,
				organizationId,
				marketplace: organizationMarketplace(organizationId),
				pluginName: plugin.name,
				version: plugin.version,
				manifest: plugin.manifest,
				organizationPluginId: plugin.id,
			})),
		)
		.onConflictDoNothing();
}
