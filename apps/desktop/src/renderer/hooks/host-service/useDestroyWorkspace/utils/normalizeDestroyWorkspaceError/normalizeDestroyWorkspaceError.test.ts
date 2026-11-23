import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { normalizeDestroyWorkspaceError } from "./normalizeDestroyWorkspaceError";

function relayError(code: string, message: string) {
	return TRPCClientError.from({
		error: { message, code: -32603, data: { code } },
	});
}

describe("normalizeDestroyWorkspaceError", () => {
	test("an offline host is its own kind, not the relay's raw text", () => {
		const error = normalizeDestroyWorkspaceError(
			relayError("SERVICE_UNAVAILABLE", "Host is not online"),
			{ relayTokenExpired: false },
		);
		expect(error.kind).toBe("host-offline");
	});

	test("a refusal of an expired relay token reads as a sign-in problem", () => {
		const error = normalizeDestroyWorkspaceError(
			relayError("UNAUTHORIZED", "Unauthorized"),
			{ relayTokenExpired: true },
		);
		expect(error.kind).toBe("sign-in-expired");
	});

	test("a refusal of a valid token keeps the server's message", () => {
		const error = normalizeDestroyWorkspaceError(
			relayError("UNAUTHORIZED", "Unauthorized"),
			{ relayTokenExpired: false },
		);
		expect(error).toEqual({ kind: "unknown", message: "Unauthorized" });
	});
});
