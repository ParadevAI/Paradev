import { describe, expect, test } from "bun:test";
import { db } from "@superset/db/client";
import { stub } from "../../../test/stub";
import { posthog } from "../../lib/analytics";

const PAGE_ID = "00000000-0000-4000-8000-000000000001";

let storedPage: Record<string, unknown> = {};

const selectOnePage = () => ({
	from: () => ({ where: () => ({ limit: async () => [storedPage] }) }),
});

stub(db, { select: selectOnePage });
stub(posthog, { capture: () => {} });

const { pageCommentRouter } = await import("../page-comment/page-comment");
const { pageSharingRouter } = await import("./sharing");
const { createCallerFactory, createTRPCContext, createTRPCRouter } =
	await import("../../trpc");

const router = createTRPCRouter({
	pageComment: pageCommentRouter,
	sharing: pageSharingRouter,
});

const noActiveOrganization = createCallerFactory(router)(
	createTRPCContext({
		session: {
			user: {
				id: "reader",
				email: "reader@example.com",
				deletionRequestedAt: null,
			},
			session: { activeOrganizationId: null },
		} as never,
		auth: {} as never,
		headers: new Headers(),
	}),
);

const page = (visibility: string) => ({
	id: PAGE_ID,
	organizationId: "00000000-0000-4000-8000-000000000002",
	visibility,
	takenDownAt: null,
});

describe("a signed-in reader with no active organization", () => {
	test("gets no comments and no grantees on a public page", async () => {
		storedPage = page("everyone");
		expect(
			await noActiveOrganization.pageComment.list({ pageId: PAGE_ID }),
		).toEqual([]);
		expect(
			await noActiveOrganization.sharing.get({ id: PAGE_ID }),
		).toMatchObject({ grantees: [], canManage: false });
	});

	test("is still turned away from an organization page", async () => {
		storedPage = page("org");
		await expect(
			noActiveOrganization.pageComment.list({ pageId: PAGE_ID }),
		).rejects.toThrow("No active organization selected");
		await expect(
			noActiveOrganization.sharing.get({ id: PAGE_ID }),
		).rejects.toThrow("No active organization selected");
	});
});
