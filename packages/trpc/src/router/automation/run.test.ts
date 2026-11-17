import { describe, expect, test } from "bun:test";
import { userError } from "../../i18n-error";
import { classifyDispatchError } from "./run";

describe("classifyDispatchError", () => {
	test("maps both cloud billing refusals to cloud_usage_limit_reached", () => {
		for (const refusal of ["cloudNeedsPaidPlan", "usageLimitReached"]) {
			expect(
				classifyDispatchError(
					userError({
						code: "FORBIDDEN",
						message: refusal,
						i18nKey: `serverError.cloudWorkspace.${refusal}`,
					}),
				),
			).toBe("cloud_usage_limit_reached");
		}
	});
});
