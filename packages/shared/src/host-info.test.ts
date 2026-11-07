import { describe, expect, test } from "bun:test";
import { resolveHostId } from "./host-info";

describe("resolveHostId", () => {
	test("uses the host id the spawning desktop passed down", () => {
		const computed = () => "computed-id";

		expect(resolveHostId({ HOST_CLIENT_ID: "desktop-id" }, computed)).toBe(
			"desktop-id",
		);
	});

	test("computes the id when no parent passed one", () => {
		const computed = () => "computed-id";

		expect(resolveHostId({}, computed)).toBe("computed-id");
		expect(resolveHostId({ HOST_CLIENT_ID: "  " }, computed)).toBe(
			"computed-id",
		);
	});
});
