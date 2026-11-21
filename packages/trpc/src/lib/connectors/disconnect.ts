import { db } from "@superset/db/client";
import { connections } from "@superset/db/schema";
import { and, eq, ne, type SQL } from "drizzle-orm";
import { releaseGoogleGrant } from "../../router/integration/google/release";
import { forgetUpstreamTools } from "../../router/plugins/proxy";

export async function deleteGoogleConnections(
	conditions: [SQL, ...(SQL | undefined)[]],
) {
	// Delete first so a concurrent token refresh cannot restore disconnected access.
	const removed = await db
		.delete(connections)
		.where(and(...conditions, eq(connections.connector, "google")))
		.returning();
	for (const connection of removed) forgetUpstreamTools(connection.id);
	for (const connection of removed) await releaseGoogleGrant(connection);
	return removed.map(({ id }) => ({ id }));
}

export async function disconnectConnections(
	conditions: [SQL, ...(SQL | undefined)[]],
	reason: string,
) {
	const removed = await deleteGoogleConnections(conditions);
	const disconnected = await db
		.update(connections)
		.set({ disconnectedAt: new Date(), disconnectReason: reason })
		.where(and(...conditions, ne(connections.connector, "google")))
		.returning({ id: connections.id });
	for (const connection of disconnected) forgetUpstreamTools(connection.id);
	return [...removed, ...disconnected];
}
