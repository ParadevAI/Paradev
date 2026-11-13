import { describe, expect, it } from "bun:test";
import { isDiffTargetForCheckout } from "./isDiffTargetForCheckout";

describe("isDiffTargetForCheckout", () => {
	it("needs the exact repository with several checkouts", () => {
		expect(
			isDiffTargetForCheckout({
				targetRepositoryId: undefined,
				repositoryId: "a",
				isMultiRepo: true,
			}),
		).toBe(false);
		expect(
			isDiffTargetForCheckout({
				targetRepositoryId: undefined,
				repositoryId: "a",
				isMultiRepo: false,
			}),
		).toBe(true);
	});
});
