import { describe, expect, it } from "bun:test";
import { requesterIp } from "./requester-ip";

describe("requesterIp", () => {
	it("takes the first forwarded address", () => {
		expect(
			requesterIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
		).toBe("203.0.113.7");
	});
});
