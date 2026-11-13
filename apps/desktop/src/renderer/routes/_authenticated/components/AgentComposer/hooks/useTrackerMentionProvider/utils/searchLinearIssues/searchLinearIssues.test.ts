import { describe, expect, mock, test } from "bun:test";
import { searchLinearIssues } from "./searchLinearIssues";

function issue(identifier: string, createdAt: string) {
	return {
		identifier,
		title: `Issue ${identifier}`,
		url: `https://linear.app/acme/issue/${identifier}`,
		branchName: "",
		createdAt,
	};
}

const unordered = [
	issue("SUP-1", "2026-09-01T00:00:00.000Z"),
	issue("SUP-3", "2026-11-01T00:00:00.000Z"),
	issue("SUP-2", "2026-10-01T00:00:00.000Z"),
];

describe("searchLinearIssues", () => {
	test("browses every open issue, newest first", async () => {
		const fetchIssues = mock(async () => ({ issues: [...unordered] }));
		const issues = await searchLinearIssues(fetchIssues, "org-1", "");
		expect(fetchIssues).toHaveBeenCalledWith({
			organizationId: "org-1",
			status: "open",
			search: null,
			orderBy: "createdAt",
		});
		expect(issues.map((i) => i.identifier)).toEqual([
			"SUP-3",
			"SUP-2",
			"SUP-1",
		]);
	});

	test("keeps search results newest first", async () => {
		const fetchIssues = mock(async () => ({ issues: [...unordered] }));
		const issues = await searchLinearIssues(fetchIssues, "org-1", "relay");
		expect(fetchIssues).toHaveBeenCalledWith({
			organizationId: "org-1",
			status: "all",
			search: "relay",
			orderBy: "createdAt",
		});
		expect(issues.map((i) => i.identifier)).toEqual([
			"SUP-3",
			"SUP-2",
			"SUP-1",
		]);
	});
});
