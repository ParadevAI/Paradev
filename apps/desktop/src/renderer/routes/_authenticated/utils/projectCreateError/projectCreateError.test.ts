import { describe, expect, test } from "bun:test";
import { toProjectCreateError } from "./projectCreateError";

const FALLBACK = "Could not create the project. Please try again.";
const STUB_OUTPUT =
	"xcode-select: note: No developer tools were found, requesting install.";

function trpcError(message: string, data: Record<string, unknown>) {
	return Object.assign(new Error(message), { data });
}

describe("toProjectCreateError", () => {
	test("missing Command Line Tools: plain copy and the reason, never git's output", () => {
		const result = toProjectCreateError(
			trpcError(STUB_OUTPUT, {
				code: "PRECONDITION_FAILED",
				gitEnvironment: {
					kind: "GIT_ENVIRONMENT",
					reason: "COMMAND_LINE_TOOLS_MISSING",
				},
			}),
			FALLBACK,
		);
		expect(result.gitEnvironmentReason).toBe("COMMAND_LINE_TOOLS_MISSING");
		expect(result.message).toContain("Command Line Tools");
		expect(result.message).not.toContain("xcode-select");
	});

	test("unexpected failure shows the fallback instead of command output", () => {
		const result = toProjectCreateError(
			trpcError(STUB_OUTPUT, { code: "INTERNAL_SERVER_ERROR" }),
			FALLBACK,
		);
		expect(result).toEqual({ message: FALLBACK, gitEnvironmentReason: null });
	});

	test("keeps a message the host wrote for the user", () => {
		const message = "Directory already exists: /Users/me/projects/hello";
		const result = toProjectCreateError(
			trpcError(message, { code: "BAD_REQUEST" }),
			FALLBACK,
		);
		expect(result.message).toBe(message);
	});
});
