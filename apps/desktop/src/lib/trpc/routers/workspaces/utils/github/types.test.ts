import { describe, expect, test } from "bun:test";
import { GHPRResponseSchema } from "./types";

function response(conclusions: string[]) {
	return {
		number: 1,
		title: "A pull request",
		url: "https://github.com/owner/repo/pull/1",
		state: "OPEN",
		isDraft: false,
		mergedAt: null,
		additions: 1,
		deletions: 0,
		headRefOid: "abc123",
		headRefName: "feature",
		reviewDecision: "",
		statusCheckRollup: conclusions.map((conclusion) => ({
			name: `check-${conclusion}`,
			status: "COMPLETED",
			conclusion,
		})),
	};
}

describe("GHPRResponseSchema", () => {
	test("accepts the check conclusions GitHub can report", () => {
		for (const conclusion of ["STARTUP_FAILURE", "STALE"]) {
			const result = GHPRResponseSchema.safeParse(response([conclusion]));
			expect(result.success).toBe(true);
		}
	});

	test("drops nothing from a pull request whose workflow failed to start", () => {
		const result = GHPRResponseSchema.safeParse(
			response(["SUCCESS", "STARTUP_FAILURE"]),
		);
		expect(result.data?.statusCheckRollup).toHaveLength(2);
	});
});
