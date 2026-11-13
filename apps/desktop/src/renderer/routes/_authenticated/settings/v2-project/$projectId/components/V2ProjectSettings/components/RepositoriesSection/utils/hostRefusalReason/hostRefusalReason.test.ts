import { describe, expect, test } from "bun:test";
import { hostRefusalReason } from "./hostRefusalReason";

describe("hostRefusalReason", () => {
	test("drops the host's code prefix", () => {
		expect(
			hostRefusalReason(
				"repository_in_use: 2 workspace(s) check out api; delete them first",
			),
		).toBe("2 workspace(s) check out api; delete them first");
	});

	test("keeps a message without a code", () => {
		expect(hostRefusalReason("Project not found")).toBe("Project not found");
		expect(hostRefusalReason("Error: boom")).toBe("Error: boom");
	});
});
