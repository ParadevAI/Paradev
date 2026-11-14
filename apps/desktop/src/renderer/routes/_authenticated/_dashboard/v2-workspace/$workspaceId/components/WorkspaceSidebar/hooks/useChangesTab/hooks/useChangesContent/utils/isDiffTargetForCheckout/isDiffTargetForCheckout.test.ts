import { describe, expect, it } from "bun:test";
import { isDiffTargetForCheckout } from "./isDiffTargetForCheckout";

describe("isDiffTargetForCheckout", () => {
	it("takes an untagged target or one in the same repository", () => {
		expect(
			isDiffTargetForCheckout({
				targetRepositoryId: undefined,
				repositoryId: "a",
			}),
		).toBe(true);
		expect(
			isDiffTargetForCheckout({ targetRepositoryId: "a", repositoryId: "a" }),
		).toBe(true);
		expect(
			isDiffTargetForCheckout({ targetRepositoryId: "b", repositoryId: "a" }),
		).toBe(false);
	});
});
