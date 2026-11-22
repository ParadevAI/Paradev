import { describe, expect, test } from "bun:test";
import { pageReadFor } from "./read-access";

const ORG = "org-1";
const OWNER = "owner-1";
const READER = "reader-1";

const page = (
	overrides: Partial<Parameters<typeof pageReadFor>[0]["page"]> = {},
) => ({
	id: "page-1",
	organizationId: ORG,
	visibility: "org" as const,
	organizationRole: "comment" as const,
	createdByUserId: OWNER,
	takenDownAt: null,
	...overrides,
});

const read = (overrides: Partial<Parameters<typeof pageReadFor>[0]> = {}) =>
	pageReadFor({
		page: page(),
		organizationId: ORG,
		reader: READER,
		shareRole: null,
		...overrides,
	});

describe("pageReadFor", () => {
	test("a reader in the page's organization reads it as a member", () => {
		expect(read()).toBe("member");
		expect(
			read({ page: page({ visibility: "just_me" }), shareRole: "view" }),
		).toBe("member");
	});

	test("a page anyone with the link can see is public to everyone else", () => {
		const everyone = page({ visibility: "everyone" });
		expect(read({ page: everyone, organizationId: "org-2" })).toBe("public");
		expect(read({ page: everyone, reader: null })).toBe("public");
	});

	test("a page outside the reader's organization is not readable unless it is public", () => {
		expect(read({ organizationId: "org-2" })).toBe("none");
		expect(
			read({
				page: page({ visibility: "just_me" }),
				organizationId: "org-2",
				shareRole: "view",
			}),
		).toBe("none");
	});

	test("a taken-down page is not public, but its members still read it", () => {
		const takenDown = page({ visibility: "everyone", takenDownAt: new Date() });
		expect(read({ page: takenDown, organizationId: "org-2" })).toBe("none");
		expect(read({ page: takenDown })).toBe("member");
	});

	test("a just-me page nobody shared with the reader is not readable", () => {
		expect(read({ page: page({ visibility: "just_me" }) })).toBe("none");
	});

	test("a caller without a reader reads only public pages", () => {
		expect(read({ reader: null })).toBe("none");
	});
});
