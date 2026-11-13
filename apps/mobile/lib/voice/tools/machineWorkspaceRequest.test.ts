import { describe, expect, test } from "bun:test";
import { machineWorkspaceRequest } from "./machineWorkspaceRequest";

describe("machineWorkspaceRequest", () => {
	test("no project is a session workspace", () => {
		expect(machineWorkspaceRequest(null, "fix it", "claude").procedure).toBe(
			"createSession",
		);
	});

	test("a project of one repository shares its checkout", () => {
		expect(
			machineWorkspaceRequest(
				{ id: "p1", repositoryCount: 1 },
				"fix it",
				"claude",
			),
		).toEqual({
			procedure: "createLocal",
			input: {
				projectId: "p1",
				agents: [{ agent: "claude", prompt: "fix it" }],
			},
		});
	});

	test("a project of several repositories gets its own worktrees", () => {
		expect(
			machineWorkspaceRequest(
				{ id: "p2", repositoryCount: 2 },
				"fix it",
				"claude",
			),
		).toEqual({
			procedure: "create",
			input: {
				projectId: "p2",
				agents: [{ agent: "claude", prompt: "fix it" }],
				namingPrompt: "fix it",
			},
		});
	});
});
