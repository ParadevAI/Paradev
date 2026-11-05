import { describe, expect, it } from "bun:test";
import {
	CLOUD_AGENT_LAUNCH_ENV_NAMES,
	cloudAgentLaunchSchema,
	cloudAgentLaunchToEnv,
	describeCloudAgentLaunch,
	hashCloudAgentPrompt,
	readCloudAgentLaunch,
	supportsCloudAgentChat,
} from "./cloud-agent-launch";
import { sandboxIdentitySchema } from "./sandbox-contract";

const fileId = "0b8f3c1e-5a2d-4f6b-9c7e-1d2e3f4a5b6c";

describe("cloud agent launch", () => {
	it.each([
		["claude", true],
		["pdev", true],
		["codex", false],
		["opencode", false],
		[undefined, false],
	] as const)("chat support for %s is %s", (agent, supported) => {
		expect(supportsCloudAgentChat(agent)).toBe(supported);
	});
	it("describes a server-planned chat without exposing its prompt", async () => {
		const launch = await describeCloudAgentLaunch({
			agent: "claude",
			prompt: "hello",
			surface: "chat",
		});
		expect(launch).toEqual({
			agent: "claude",
			surface: "chat",
			promptHash:
				"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
			terminalId: null,
		});
		expect(await hashCloudAgentPrompt("hello ")).not.toBe(launch?.promptHash);
	});

	it("keeps terminal launches on the terminal path", async () => {
		expect(
			(await describeCloudAgentLaunch({ agent: "claude", prompt: "hello" }))
				?.surface,
		).toBe("terminal");
	});

	it("reports a chat launch with a saved effort as chat, as the sandbox starts it", async () => {
		expect(
			(
				await describeCloudAgentLaunch({
					agent: "claude",
					prompt: "hello",
					surface: "chat",
					effort: "high",
				})
			)?.surface,
		).toBe("chat");
	});

	it("does not invent a launch or a text fingerprint for an empty prompt", async () => {
		expect(await describeCloudAgentLaunch(undefined)).toBeNull();
		expect(
			(
				await describeCloudAgentLaunch({
					agent: "claude",
					prompt: "",
					surface: "chat",
				})
			)?.promptHash,
		).toBeNull();
	});

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

	it("reaches the box and the describer with the chosen terminal id", async () => {
		const terminalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
		const launch = {
			agent: "claude",
			prompt: "go",
			surface: "chat" as const,
			terminalId,
		};
		const env = cloudAgentLaunchToEnv(launch);
		expect(readCloudAgentLaunch(env)?.terminalId).toBe(terminalId);
		expect(
			readCloudAgentLaunch({ ...env, SUPERSET_SANDBOX_AGENT_TERMINAL_ID: "x" })
				?.terminalId,
		).toBeUndefined();
		expect((await describeCloudAgentLaunch(launch))?.terminalId).toBe(
			terminalId,
		);
	});

	it("carries an automation run id and drops one that is not a uuid", () => {
		const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
		const env = cloudAgentLaunchToEnv({
			agent: "claude",
			prompt: "triage",
			automationRunId: runId,
		});
		expect(readCloudAgentLaunch(env)?.automationRunId).toBe(runId);
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

	it("writes every launch variable into sandbox.conf instead of stripping it", () => {
		const keys = Object.keys(sandboxIdentitySchema.shape);
		expect(
			CLOUD_AGENT_LAUNCH_ENV_NAMES.filter((name) => !keys.includes(name)),
		).toEqual([]);
	});
});
