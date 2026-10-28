import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { FakeHarness } from "../../harness/fake";
import type { HarnessRegistry } from "../../sessions";
import { turn } from "../../testing/fixtures";
import { createTestRuntime } from "../../testing/testRuntime";
import { FAKE_HARNESS, waitFor } from "../../testing/testUtils";

function runtimeWithTitledAgent() {
	const harnesses: HarnessRegistry = new Map([
		[
			FAKE_HARNESS,
			() =>
				new FakeHarness({
					start: [
						{
							kind: "session",
							session: {
								status: "idle",
								harnessSessionId: "agent-1",
								title: "Agent title",
							},
						},
					],
					turns: [
						[
							{ kind: "session", session: { title: "Later agent title" } },
							{ kind: "turn", turn: turn("t1", { status: "completed" }) },
						],
					],
				}),
		],
	]);
	return createTestRuntime({ harnesses });
}

function createChat(runtime: ReturnType<typeof createTestRuntime>) {
	return runtime.commands.createSession({
		commandId: randomUUID(),
		scopeId: "workspace-1",
		harness: FAKE_HARNESS,
		cwd: "/tmp/workspace",
	});
}

describe("renaming a chat", () => {
	test("a user title wins over the agent's, before and after the agent retitles", async () => {
		const runtime = runtimeWithTitledAgent();
		const { sessionId } = createChat(runtime);
		await waitFor(
			() => runtime.sessions.get(sessionId)?.title === "Agent title",
		);

		runtime.commands.renameSession({ sessionId, title: "  My chat " });
		const live = runtime.live.require(sessionId);
		live.prompt([{ type: "text", text: "hi" }], randomUUID());
		await waitFor(() => live.turn?.status === "completed");

		expect(live.state).toMatchObject({
			title: "My chat",
			userTitle: "My chat",
		});
		expect(runtime.sessions.get(sessionId)).toMatchObject({
			title: "My chat",
			userTitle: "My chat",
		});
		await runtime.dispose();
	});

	test("a stopped chat keeps its new title when it is resumed", async () => {
		const runtime = runtimeWithTitledAgent();
		const { sessionId } = createChat(runtime);
		await waitFor(() => runtime.live.get(sessionId)?.state.status === "idle");
		await runtime.commands.closeSession({ sessionId });

		runtime.commands.renameSession({ sessionId, title: "Stopped chat" });
		expect(runtime.sessions.get(sessionId)?.title).toBe("Stopped chat");

		const resumed = runtime.commands.createSession({
			commandId: randomUUID(),
			scopeId: "workspace-1",
			harness: FAKE_HARNESS,
			cwd: "/tmp/workspace",
			resume: { harnessSessionId: "agent-1" },
		});
		await waitFor(
			() => runtime.live.get(resumed.sessionId)?.state.status === "idle",
		);
		expect(runtime.sessions.get(resumed.sessionId)).toMatchObject({
			title: "Stopped chat",
			userTitle: "Stopped chat",
		});
		await runtime.dispose();
	});
});
