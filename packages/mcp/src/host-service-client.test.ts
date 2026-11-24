import { describe, expect, test } from "bun:test";
import {
	canWakeAndRetry,
	HostServiceUnreachableError,
} from "./host-service-client";

describe("canWakeAndRetry", () => {
	const stopped = new HostServiceUnreachableError("stopped", 410);
	const badGateway = new HostServiceUnreachableError("proxy", 502);
	const dropped = new HostServiceUnreachableError("network");

	test("a query is retried after any failure where host-service did not answer", () => {
		for (const error of [stopped, badGateway, dropped]) {
			expect(canWakeAndRetry("query", error)).toBe(true);
		}
	});

	test("a mutation is retried only after a stopped box's 410", () => {
		expect(canWakeAndRetry("mutation", stopped)).toBe(true);
		expect(canWakeAndRetry("mutation", badGateway)).toBe(false);
		expect(canWakeAndRetry("mutation", dropped)).toBe(false);
	});

	test("an error host-service answered is never retried", () => {
		expect(canWakeAndRetry("query", new Error("host said no"))).toBe(false);
	});
});
