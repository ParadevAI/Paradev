import { describe, expect, it } from "bun:test";
import { nameParts } from "./nameParts";

describe("nameParts", () => {
	it("keeps the last dash-separated part, where names in a series differ", () => {
		expect(
			nameParts("refactor-onboarding-checklist-and-invite-flow-part-3"),
		).toEqual({
			head: "refactor-onboarding-checklist-and-invite-flow",
			tail: "-part-3",
		});
	});

	it("keeps the last characters when no dash is near the end", () => {
		expect(nameParts("averyveryverylongworkspacename").tail).toBe("cename");
	});

	it("leaves a short name whole", () => {
		expect(nameParts("fix-flaky")).toEqual({ head: "fix-flaky", tail: "" });
	});
});
