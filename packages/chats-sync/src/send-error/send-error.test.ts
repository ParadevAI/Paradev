import { expect, test } from "bun:test";
import { ApiError } from "../http/http.ts";
import { sendError } from "./send-error.ts";

test("a validation error asks for a valid address", () => {
	expect(
		sendError(new ApiError(400, "invalid", "email: Invalid email address")),
	).toBe("Enter a valid email address.");
});

test("a rate limit shows the server's message", () => {
	expect(
		sendError(
			new ApiError(
				429,
				"rate_limited",
				"Too many sign-in emails. Try again in a few minutes.",
			),
		),
	).toBe("Too many sign-in emails. Try again in a few minutes.");
});

test("an address the server can't email to shows the server's message", () => {
	expect(
		sendError(
			new ApiError(
				422,
				"undeliverable",
				"We can't send email to that address.",
			),
		),
	).toBe("We can't send email to that address.");
});

test("server errors and being offline get a generic message", () => {
	expect(
		sendError(new ApiError(500, "internal", "Something went wrong")),
	).toMatch(/Couldn't reach Paradev/);
	expect(sendError(new TypeError("Failed to fetch"))).toMatch(
		/Couldn't reach Paradev/,
	);
});
