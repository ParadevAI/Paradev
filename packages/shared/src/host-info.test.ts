import { describe, expect, test } from "bun:test";
import { hostIdFromMachineId, resolveHostId } from "./host-info";

test("user-scoped Linux host IDs differ across users while the default ID stays stable", () => {
	const machineId = "e7db93c07f3f447ea332effaf7761af5";
	const legacyId = hostIdFromMachineId(machineId);
	const firstScopedId = hostIdFromMachineId(machineId, 1000);
	const secondScopedId = hostIdFromMachineId(machineId, 1001);

	expect(legacyId).toBe("c7e9481b11f6e75ece8cd8d2c38ae23e");
	expect(new Set([legacyId, firstScopedId, secondScopedId]).size).toBe(3);
});

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
