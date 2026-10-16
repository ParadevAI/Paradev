import { describe, expect, test } from "bun:test";
import { CardUnavailable } from "../types";
import { notFound, reconnectOnAuthError } from "./gmailClient";

function apiError(status: number, message: string): Error {
	return Object.assign(new Error(message), { status });
}

function stateOf(error: unknown): string {
	try {
		reconnectOnAuthError(error);
	} catch (thrown) {
		return thrown instanceof CardUnavailable
			? `${thrown.state}: ${thrown.text}`
			: "rethrown";
	}
	return "returned";
}

describe("reconnectOnAuthError", () => {
	test("maps Google's API errors by status, not by their wording", () => {
		expect(
			stateOf(apiError(401, "Request had invalid authentication credentials")),
		).toBe("no_connector: Gmail needs reconnecting");
		expect(stateOf(apiError(403, "Insufficient Permission"))).toBe(
			"no_connector: Gmail needs reconnecting",
		);
		expect(stateOf(apiError(403, "User-rate limit exceeded"))).toBe(
			"error: Gmail is busy. Try again in a minute",
		);
		expect(stateOf(apiError(429, "Too many requests"))).toBe(
			"error: Gmail is busy. Try again in a minute",
		);
		expect(stateOf(apiError(400, "Invalid To header"))).toBe(
			"error: Gmail refused that email",
		);
		expect(stateOf(new Error("invalid_grant"))).toBe(
			"no_connector: Gmail needs reconnecting",
		);
		expect(stateOf(apiError(500, "Backend Error"))).toBe("rethrown");
		expect(notFound(apiError(404, "Not Found"))).toBe(true);
	});
});
