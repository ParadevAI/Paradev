import { describe, expect, test } from "bun:test";
import { CLIError } from "@superset/cli-framework";
import { environmentLimitHint } from "./environmentLimitHint";

function apiError(i18nKey: string) {
	return Object.assign(
		new Error("Your organization has reached its environment limit (3)."),
		{
			data: { code: "FORBIDDEN", i18nKey },
		},
	);
}

describe("environmentLimitHint", () => {
	test("adds CLI commands to the limit refusal", () => {
		try {
			environmentLimitHint(apiError("serverError.environment.limitReached"));
		} catch (error) {
			expect(error).toBeInstanceOf(CLIError);
			expect((error as CLIError).message).toContain("environment limit (3)");
			expect((error as CLIError).suggestion).toContain(
				"superset environments archive",
			);
			return;
		}
		throw new Error("expected a throw");
	});

	test("passes any other error through unchanged", () => {
		const other = apiError("serverError.environment.environmentNotFound");
		expect(() => environmentLimitHint(other)).toThrow(other);
	});
});
