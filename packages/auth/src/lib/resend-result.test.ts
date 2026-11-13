import { expect, test } from "bun:test";
import { throwOnResendError } from "./resend-result";

test("turns a Resend error result into a thrown error", () => {
	expect(() =>
		throwOnResendError({
			error: { name: "rate_limit_exceeded", message: "Too many requests" },
		}),
	).toThrow("Resend rate_limit_exceeded: Too many requests");
	expect(() => throwOnResendError({ error: null })).not.toThrow();
});
