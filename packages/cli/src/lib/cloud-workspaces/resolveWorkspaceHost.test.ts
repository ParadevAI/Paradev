import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../api-client";
import { resolveWorkspaceHost } from "./resolveWorkspaceHost";

const api = {
	cloudWorkspace: {
		available: {
			query: () => {
				throw new Error("an explicit --host must not ask the API");
			},
		},
	},
} as unknown as ApiClient;

describe("resolveWorkspaceHost", () => {
	it("treats --host cloud as the cloud, in any case", async () => {
		for (const host of ["cloud", "Cloud", "CLOUD"]) {
			expect(await resolveWorkspaceHost({ host }, api, "org")).toBeUndefined();
		}
	});

	it("keeps a real host id", async () => {
		expect(await resolveWorkspaceHost({ host: "host-1" }, api, "org")).toBe(
			"host-1",
		);
	});

	it("refuses --host cloud with --local", async () => {
		await expect(
			resolveWorkspaceHost({ host: "cloud", local: true }, api, "org"),
		).rejects.toThrow("Pass either --host or --local, not both");
	});
});
