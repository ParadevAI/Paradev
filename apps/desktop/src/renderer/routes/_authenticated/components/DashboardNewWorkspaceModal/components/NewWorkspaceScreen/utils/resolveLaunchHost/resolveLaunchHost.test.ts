import { expect, test } from "bun:test";
import { resolveLaunchHost } from "./resolveLaunchHost";

test("a host named by the link wins over the saved pick", () => {
	expect(
		resolveLaunchHost({
			intentHostId: "cloud",
			savedHostId: "mac",
			machineId: "mac",
		}),
	).toBe("cloud");
});

test("the saved pick wins over this device", () => {
	expect(
		resolveLaunchHost({
			intentHostId: null,
			savedHostId: "cloud",
			machineId: "mac",
		}),
	).toBe("cloud");
});

test("with nothing saved, this device", () => {
	expect(
		resolveLaunchHost({
			intentHostId: null,
			savedHostId: null,
			machineId: "mac",
		}),
	).toBe("mac");
});
