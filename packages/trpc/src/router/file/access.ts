import { db } from "@superset/db/client";
import { pages, pageVersions } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { assertPageReadable } from "../page/access";
import type { ATTACHMENT_PARENT_KINDS } from "./schema";

type ParentKind = (typeof ATTACHMENT_PARENT_KINDS)[number];

/**
 * Access to a file always derives from access to a parent it is attached
 * to. Kinds gain a branch here when their surface ships; an unimplemented
 * kind refusing loudly beats a silent allow.
 */
export async function assertParentReadable({
	parentKind,
	parentId,
	userId,
	organizationId,
}: {
	parentKind: ParentKind;
	parentId: string;
	userId: string;
	organizationId: string;
}): Promise<void> {
	if (parentKind === "page_version") {
		const [row] = await db
			.select({ page: pages })
			.from(pageVersions)
			.innerJoin(pages, eq(pages.id, pageVersions.pageId))
			.where(
				and(
					eq(pageVersions.id, parentId),
					eq(pages.organizationId, organizationId),
				),
			)
			.limit(1);
		if (!row) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Parent not found" });
		}
		assertPageReadable(row.page, userId);
		return;
	}
	throw new TRPCError({
		code: "NOT_IMPLEMENTED",
		message: `Attachments on ${parentKind} land with that surface`,
	});
}
