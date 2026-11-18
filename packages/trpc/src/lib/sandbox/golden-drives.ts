import { db } from "@superset/db/client";
import { environments } from "@superset/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { type DriveHost, vercelDrives } from "./drives";

/**
 * An environment's golden drive goes once no live environment names it. Its
 * forks are independent drives and stay readable after it is deleted.
 */
export async function deleteGoldenDriveIfUnreferenced(
	name: string | null | undefined,
	drives: DriveHost = vercelDrives(),
): Promise<void> {
	if (!name) return;
	const referenced = await db.query.environments.findFirst({
		where: and(
			eq(environments.goldenDriveName, name),
			isNull(environments.archivedAt),
		),
		columns: { id: true },
	});
	if (referenced) return;
	await drives.remove(name);
}
