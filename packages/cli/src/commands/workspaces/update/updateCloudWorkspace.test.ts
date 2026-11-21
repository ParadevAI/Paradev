import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../../../lib/api-client";
import { describeResize, updateCloudWorkspace } from "./updateCloudWorkspace";

function fakeApi() {
	const calls: Array<[string, unknown]> = [];
	const mutation = (name: string) => ({
		mutate: async (input: unknown) => {
			calls.push([name, input]);
			return {};
		},
	});
	const api = {
		cloudWorkspace: {
			get: {
				query: async () => ({
					tasks: [{ id: "task-1" }, { id: "task-2" }],
					labels: [{ id: "label-1", name: "Bug" }],
				}),
			},
			rename: mutation("rename"),
			linkTask: mutation("linkTask"),
			unlinkTask: mutation("unlinkTask"),
			addLabel: mutation("addLabel"),
			removeLabel: mutation("removeLabel"),
			setMachineSize: mutation("setMachineSize"),
		},
		task: {
			byIdOrSlug: {
				query: async (idOrSlug: string) =>
					idOrSlug === "SUP-9" ? { id: "task-9" } : null,
			},
		},
	} as unknown as ApiClient;
	return { api, calls };
}

describe("updateCloudWorkspace", () => {
	it("clears every linked task, and removes labels by name before adding", async () => {
		const { api, calls } = fakeApi();
		await updateCloudWorkspace(api, "ws-1", {
			task: null,
			addLabels: ["Docs", "docs"],
			removeLabels: [" bug ", "BUG"],
		});
		expect(calls).toEqual([
			["unlinkTask", { id: "ws-1", taskId: "task-1" }],
			["unlinkTask", { id: "ws-1", taskId: "task-2" }],
			["removeLabel", { id: "ws-1", labelId: "label-1" }],
			["addLabel", { id: "ws-1", name: "Docs" }],
		]);
	});

	it("links a task by slug", async () => {
		const { api, calls } = fakeApi();
		await updateCloudWorkspace(api, "ws-1", { task: "SUP-9" });
		expect(calls).toEqual([["linkTask", { id: "ws-1", taskId: "task-9" }]]);
	});

	it("writes nothing when a task or label does not resolve", async () => {
		const { api, calls } = fakeApi();
		await expect(
			updateCloudWorkspace(api, "ws-1", {
				name: "new",
				removeLabels: ["Nope"],
			}),
		).rejects.toThrow('has no label "Nope"');
		await expect(
			updateCloudWorkspace(api, "ws-1", { name: "new", task: "SUP-404" }),
		).rejects.toThrow("Task not found: SUP-404");
		expect(calls).toEqual([]);
	});

	it("resizes after every other write", async () => {
		const { api, calls } = fakeApi();
		await updateCloudWorkspace(api, "ws-1", {
			machineSize: "xlarge",
			name: "new",
		});
		expect(calls).toEqual([
			["rename", { id: "ws-1", name: "new" }],
			["setMachineSize", { id: "ws-1", machineSize: "xlarge" }],
		]);
	});
});

describe("describeResize", () => {
	const resize = {
		machineSize: "xlarge",
		vcpus: 16,
		running: true,
		restarted: false,
		boxVcpus: 8,
	};

	it("reports a restart that came up at the wrong size", () => {
		expect(describeResize("ws-1", { ...resize, restarted: true })).toContain(
			"came up at 8 vCPU instead of xlarge (16 vCPU)",
		);
		expect(
			describeResize("ws-1", { ...resize, restarted: true, boxVcpus: 16 }),
		).toBe("Restarted cloud workspace ws-1 at xlarge (16 vCPU)");
	});
});
