import { describe, expect, test } from "bun:test";
import { cloudWorkspaceStatusFor } from "./client-status";

const desktop = (version: string) => ({ product: "desktop" as const, version });

describe("cloudWorkspaceStatusFor", () => {
	test("a released client below the floor reads the old names", () => {
		expect(cloudWorkspaceStatusFor(desktop("2.0.9"), "awake")).toBe("ready");
		expect(cloudWorkspaceStatusFor(desktop("1.31.0"), "asleep")).toBe("ready");
		expect(cloudWorkspaceStatusFor(desktop("2.0.9"), "archived")).toBe(
			"deleted",
		);
		expect(cloudWorkspaceStatusFor(desktop("2.0.9"), "failed")).toBe("failed");
		expect(
			cloudWorkspaceStatusFor(
				{ product: "sdk", version: "0.0.1-alpha.12" },
				"asleep",
			),
		).toBe("ready");
	});

	test("current clients and web read the new names", () => {
		expect(cloudWorkspaceStatusFor(desktop("2.0.10"), "asleep")).toBe("asleep");
		expect(cloudWorkspaceStatusFor(null, "archived")).toBe("archived");
		expect(
			cloudWorkspaceStatusFor(
				{ product: "mobile", version: "1.2.3" },
				"asleep",
			),
		).toBe("asleep");
	});
});
