import { timingSafeEqual } from "node:crypto";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import type { BoxPressure } from "@superset/shared/box-pressure";
import { and, eq, ne } from "drizzle-orm";
import { publishBoxPressure } from "../realtime";
import { sandboxHostSecretFor } from "./access";

export type ReportSandboxBoxPressureOutcome =
	| "ok"
	| "unauthorized"
	| "unknown"
	| "undelivered";

export async function reportSandboxBoxPressure(args: {
	workspaceId: string;
	presentedSecret: string;
	pressure: BoxPressure | null;
}): Promise<ReportSandboxBoxPressureOutcome> {
	const expected = Buffer.from(await sandboxHostSecretFor(args.workspaceId));
	const presented = Buffer.from(args.presentedSecret);
	if (
		expected.length !== presented.length ||
		!timingSafeEqual(expected, presented)
	) {
		return "unauthorized";
	}
	const [row] = await db
		.select({ organizationId: cloudWorkspaces.organizationId })
		.from(cloudWorkspaces)
		.where(
			and(
				eq(cloudWorkspaces.id, args.workspaceId),
				ne(cloudWorkspaces.status, "deleted"),
			),
		);
	if (!row) return "unknown";
	const delivered = await publishBoxPressure(
		row.organizationId,
		args.workspaceId,
		args.pressure,
	);
	return delivered ? "ok" : "undelivered";
}
