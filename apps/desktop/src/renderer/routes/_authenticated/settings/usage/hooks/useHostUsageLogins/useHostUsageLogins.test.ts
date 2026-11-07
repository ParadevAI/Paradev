import { describe, expect, it } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { hostServiceQueryRetry } from "renderer/lib/host-service-client";
import { loginsQueryRetry } from "./useHostUsageLogins";

function hostError(code: string) {
	return TRPCClientError.from({
		error: { message: `usage.logins: ${code}`, code: -32603, data: { code } },
	});
}

describe("loginsQueryRetry", () => {
	it("retries one timed-out poll before it shows as an error", () => {
		expect(loginsQueryRetry(0, hostError("TIMEOUT"))).toBe(true);
		expect(loginsQueryRetry(1, hostError("TIMEOUT"))).toBe(false);
	});

	it("keeps the connection retries of every host-service query", () => {
		const errors = [
			TRPCClientError.from(new TypeError("Failed to fetch")),
			hostError("SERVICE_UNAVAILABLE"),
		];
		for (const error of errors) {
			for (const failureCount of [0, 1, 2, 3]) {
				expect(loginsQueryRetry(failureCount, error)).toBe(
					hostServiceQueryRetry(failureCount, error),
				);
			}
		}
	});

	it("does not retry other host errors", () => {
		for (const code of [
			"UNAUTHORIZED",
			"BAD_REQUEST",
			"INTERNAL_SERVER_ERROR",
		]) {
			expect(loginsQueryRetry(0, hostError(code))).toBe(false);
		}
	});
});
