import { expect, test } from "bun:test";
import { describeCloudAgentLaunch } from "@superset/shared/cloud-agent-launch";
import { queuedLaunch } from "./queued-launch";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("a launch nobody promised a terminal id gets one, in the job and in initialLaunch", async () => {
	const launch = queuedLaunch({ agent: "claude", prompt: "fix it" }, false);
	expect(launch.terminalId).toMatch(UUID);
	const initial = await describeCloudAgentLaunch(launch);
	expect(initial?.terminalId).toBe(launch.terminalId ?? "");
	expect(initial?.surface).toBe("terminal");
});

test("a caller's own terminal id and the chat surface are kept", () => {
	const terminalId = "33333333-3333-4333-8333-333333333333";
	expect(
		queuedLaunch({ agent: "claude", prompt: "", terminalId }, true),
	).toMatchObject({ terminalId, surface: "chat" });
});
