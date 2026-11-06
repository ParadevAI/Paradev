import { describe, expect, test } from "bun:test";
import { isMissingEndpoint } from "./isMissingEndpoint";

describe("isMissingEndpoint", () => {
	test("a 404 from tRPC or from the HTTP response is a missing endpoint", () => {
		expect(isMissingEndpoint({ data: { httpStatus: 404 } })).toBe(true);
		expect(isMissingEndpoint({ meta: { response: { status: 404 } } })).toBe(
			true,
		);
	});

	test("any other failure is not", () => {
		expect(isMissingEndpoint({ data: { httpStatus: 500 } })).toBe(false);
		expect(isMissingEndpoint(new Error("Network request failed"))).toBe(false);
		expect(isMissingEndpoint(null)).toBe(false);
	});
});
