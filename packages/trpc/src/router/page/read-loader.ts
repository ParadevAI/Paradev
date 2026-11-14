import { db } from "@superset/db/client";
import {
	members,
	organizations,
	pages,
	type SelectPage,
} from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, type SQL } from "drizzle-orm";
import { userError } from "../../i18n-error";
import { loadPageShareRole, pageReadableBy } from "./access";
import { noPageAccess, type PageCaller, pageCaller } from "./page-caller";
import { pageReadFor } from "./read-access";
import { isPubliclyServed } from "./shared-version";

export function pageIdentity({
	id,
	slug,
}: {
	id?: string;
	slug?: string;
}): SQL {
	const identity = id ? eq(pages.id, id) : slug ? eq(pages.slug, slug) : null;
	if (!identity) {
		throw userError({
			code: "BAD_REQUEST",
			message: "Provide either id or slug",
			i18nKey: "serverError.page.provideEitherIdOrSlug",
		});
	}
	return identity;
}

export async function pageNotFound(
	identity: SQL,
	userId: string,
): Promise<TRPCError> {
	const [elsewhere] = await db
		.select({ organizationName: organizations.name })
		.from(pages)
		.innerJoin(
			members,
			and(
				eq(members.organizationId, pages.organizationId),
				eq(members.userId, userId),
			),
		)
		.innerJoin(organizations, eq(organizations.id, pages.organizationId))
		.where(and(identity, pageReadableBy(userId)))
		.limit(1);

	if (!elsewhere) {
		return userError({
			code: "NOT_FOUND",
			message: "Page not found",
			i18nKey: "serverError.page.pageNotFound",
		});
	}
	return new TRPCError({
		code: "FORBIDDEN",
		message: `This page belongs to ${elsewhere.organizationName}. Switch to that organization to open it.`,
	});
}

/**
 * For reads only: a page in another organization is readable when anyone
 * with the link may see it. Changes keep using `loadPage`, scoped to the
 * caller's organization.
 */
export async function loadReadablePage(
	ctx: Parameters<typeof pageCaller>[0],
	ref: { id?: string; slug?: string },
): Promise<
	| { page: SelectPage; member: true; caller: PageCaller }
	| { page: SelectPage; member: false; caller: PageCaller | null }
> {
	const identity = pageIdentity(ref);
	const [caller, [page]] = await Promise.all([
		pageCaller(ctx).catch((error: unknown) => {
			if (error instanceof TRPCError && error.code === "FORBIDDEN")
				return error;
			throw error;
		}),
		db.select().from(pages).where(identity).limit(1),
	]);
	if (caller instanceof TRPCError) {
		if (page && isPubliclyServed(page)) {
			return { page: asSeenByAnyone(page), member: false, caller: null };
		}
		throw caller;
	}
	if (page) {
		const inOrganization =
			caller.reader !== null && page.organizationId === caller.organizationId;
		const read = pageReadFor({
			page,
			organizationId: caller.organizationId,
			reader: caller.reader,
			shareRole:
				inOrganization && caller.reader
					? await loadPageShareRole(page, caller.reader)
					: null,
		});
		if (read === "member") return { page, member: true, caller };
		if (read === "public") {
			return { page: asSeenByAnyone(page), member: false, caller };
		}
	}
	if (!caller.reader) throw noPageAccess();
	throw await pageNotFound(identity, caller.reader);
}

function asSeenByAnyone(page: SelectPage): SelectPage {
	return {
		...page,
		createdByUserId: null,
		organizationRole: "view",
		takenDownByUserId: null,
		takenDownNote: null,
		watchedByAgent: null,
		watchState: null,
		watchHeartbeatAt: null,
	};
}

/** A non-member asked for a version other than the one served to anyone. */
export async function versionNotServed(
	caller: PageCaller | null,
	ref: { id?: string; slug?: string },
	version: number | null,
): Promise<TRPCError> {
	const elsewhere = caller?.reader
		? await pageNotFound(pageIdentity(ref), caller.reader)
		: null;
	if (elsewhere?.code === "FORBIDDEN") return elsewhere;
	return new TRPCError({
		code: "NOT_FOUND",
		message: `Version ${version} not found`,
	});
}

export async function readAsMember<T>(
	ctx: Parameters<typeof pageCaller>[0],
	id: string,
	read: () => Promise<T>,
): Promise<T | null> {
	try {
		return await read();
	} catch (error) {
		if (error instanceof TRPCError && (await readsAsNonMember(ctx, id))) {
			return null;
		}
		throw error;
	}
}

async function readsAsNonMember(
	ctx: Parameters<typeof pageCaller>[0],
	id: string,
): Promise<boolean> {
	try {
		return !(await loadReadablePage(ctx, { id })).member;
	} catch (error) {
		if (error instanceof TRPCError) return false;
		throw error;
	}
}
