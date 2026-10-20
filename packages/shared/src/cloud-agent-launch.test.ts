import { describe, expect, it } from "bun:test";
import {
	cloudAgentLaunchSchema,
	cloudAgentLaunchToEnv,
	readCloudAgentLaunch,
} from "./cloud-agent-launch";

const fileId = "0b8f3c1e-5a2d-4f6b-9c7e-1d2e3f4a5b6c";

describe("cloud agent launch", () => {
	it("keeps attachments through the provisioning job's validation", () => {
		const launch = cloudAgentLaunchSchema.parse({
			agent: "claude",
			prompt: "read the image",
			attachmentFileIds: [fileId],
		});
		expect(launch.attachmentFileIds).toEqual([fileId]);
	});

	it("reaches the box with its attachments", () => {
		const env = cloudAgentLaunchToEnv({
			agent: "claude",
			prompt: "read the image",
			attachmentFileIds: [fileId],
		});
		expect(readCloudAgentLaunch(env)?.attachmentFileIds).toEqual([fileId]);
	});

	it("reaches the box as a chat", () => {
		const env = cloudAgentLaunchToEnv({
			agent: "claude",
			prompt: "fix the bug",
			surface: "chat",
		});
		expect(readCloudAgentLaunch(env)?.surface).toBe("chat");
	});

	it("carries an automation run id and omits it for a manual launch", () => {
		const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const env = cloudAgentLaunchToEnv({
			agent: "claude",
			prompt: "triage",
			automationRunId: runId,
		});
		expect(readCloudAgentLaunch(env)?.automationRunId).toBe(runId);
		expect(env.SUPERSET_SANDBOX_AGENT_AUTOMATION_RUN_ID).toBe(runId);
		const manual = cloudAgentLaunchToEnv({
			agent: "claude",
			prompt: "triage",
		});
		expect(manual.SUPERSET_SANDBOX_AGENT_AUTOMATION_RUN_ID).toBeUndefined();
		expect(readCloudAgentLaunch(manual)?.automationRunId).toBeUndefined();
		expect(
			readCloudAgentLaunch({
				...env,
				SUPERSET_SANDBOX_AGENT_AUTOMATION_RUN_ID: "not-a-uuid",
			})?.automationRunId,
		).toBeUndefined();
	});

	it("refuses an agent the sandbox does not install", () => {
		expect(
			cloudAgentLaunchSchema.safeParse({ agent: "nope", prompt: "" }).success,
		).toBe(false);
	});
});
