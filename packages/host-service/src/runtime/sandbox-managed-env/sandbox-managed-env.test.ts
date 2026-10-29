import { afterEach, describe, expect, test } from "bun:test";
import {
	getManagedEnv,
	hasManagedEnv,
	resetManagedEnvForTests,
	setManagedEnv,
	waitForManagedEnv,
	waitForSandboxManagedEnv,
} from "./sandbox-managed-env";

afterEach(() => resetManagedEnvForTests());

describe("the managed environment", () => {
	test("is empty until the control plane pushes", async () => {
		expect(hasManagedEnv()).toBe(false);
		expect(getManagedEnv()).toEqual({});
		expect(await waitForManagedEnv(10)).toBe(false);
	});

	test("a push replaces the whole set, and the first push releases waiters", async () => {
		const waiting = waitForManagedEnv(5_000);
		setManagedEnv({ A: "1", B: "2" });
		expect(await waiting).toBe(true);
		setManagedEnv({ B: "3" });
		expect(getManagedEnv()).toEqual({ B: "3" });
	});

	test("an empty push (release) leaves nothing behind but counts as pushed", () => {
		setManagedEnv({ A: "1" });
		setManagedEnv({});
		expect(getManagedEnv()).toEqual({});
		expect(hasManagedEnv()).toBe(true);
	});

	test("sandbox agent launches wait before reading the managed environment", async () => {
		let released = false;
		const waiting = waitForSandboxManagedEnv(100, "sandbox").then(() => {
			released = true;
			return getManagedEnv();
		});
		await Promise.resolve();
		expect(released).toBe(false);
		await setManagedEnv({ SUPERSET_TEST_MANAGED_VALUE: "ready" });
		expect(await waiting).toEqual({ SUPERSET_TEST_MANAGED_VALUE: "ready" });
	});

	test("local agent launches do not wait for a sandbox environment", async () => {
		expect(await waitForSandboxManagedEnv(100, "local")).toBe(true);
		expect(hasManagedEnv()).toBe(false);
	});

	test("the sandbox launch wait uses the supplied timeout", async () => {
		expect(await waitForSandboxManagedEnv(0, "sandbox")).toBe(false);
	});

	test("what callers get is a copy", () => {
		setManagedEnv({ A: "1" });
		getManagedEnv().A = "changed";
		expect(getManagedEnv().A).toBe("1");
	});
});
