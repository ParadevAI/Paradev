import { describe, expect, test } from "bun:test";
import { userError } from "../../i18n-error";
import { AgentToolsUnavailableError } from "../../lib/sandbox/vercel";
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

	test("a box whose agents drive cannot be mounted is a cloud box that is not ready", () => {
		expect(
			classifyDispatchError(
				new AgentToolsUnavailableError("agent-tools-sfo1-0123456789ab"),
			),
		).toBe("cloud_not_ready");
	});
});
