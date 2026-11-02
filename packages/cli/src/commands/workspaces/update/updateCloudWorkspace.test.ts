import { describe, expect, it } from "bun:test";
import type { ApiClient } from "../../../lib/api-client";
import { updateCloudWorkspace } from "./updateCloudWorkspace";

function fakeApi() {
	const calls: Array<[string, unknown]> = [];
	const mutation = (name: string, result: unknown = {}) => ({
		mutate: async (input: unknown) => {
			calls.push([name, input]);
			return result;
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
			linkTask: mutation("linkTask"),
			unlinkTask: mutation("unlinkTask"),
			addLabel: mutation("addLabel"),
			removeLabel: mutation("removeLabel"),
		},
		task: { byIdOrSlug: { query: async () => ({ id: "task-9" }) } },
	} as unknown as ApiClient;
	return { api, calls };
}

describe("updateCloudWorkspace", () => {
	it("clears every linked task and removes labels by name", async () => {
		const { api, calls } = fakeApi();
		await updateCloudWorkspace(api, "ws-1", {
			task: null,
			removeLabels: ["bug"],
		});
		expect(calls).toEqual([
			["unlinkTask", { id: "ws-1", taskId: "task-1" }],
			["unlinkTask", { id: "ws-1", taskId: "task-2" }],
			["removeLabel", { id: "ws-1", labelId: "label-1" }],
		]);
	});

	it("links a task by slug and refuses a label the workspace lacks", async () => {
		const { api, calls } = fakeApi();
		await updateCloudWorkspace(api, "ws-1", { task: "SUP-9" });
		expect(calls).toEqual([["linkTask", { id: "ws-1", taskId: "task-9" }]]);
		await expect(
			updateCloudWorkspace(api, "ws-1", { removeLabels: ["Docs"] }),
		).rejects.toThrow('has no label "Docs"');
	});
});
