import { describe, expect, test } from "bun:test";
import { BUILTIN_AGENT_IDS } from "@superset/shared/agent-catalog";
import { resolveAgentLaunchPresetId } from "@superset/shared/agent-models";
import { agentLaunchPreset, opensInChat } from "./useResolveOpenAsChat";

const CHAT_PRESETS = ["claude", "codex", "opencode", "pi", "pdev"];

function chatSetting(enabled: boolean) {
	let reads = 0;
	return {
		read: async () => {
			reads += 1;
			return enabled;
		},
		reads: () => reads,
	};
}

describe("opensInChat", () => {
	test.each(
		CHAT_PRESETS,
	)("%s opens in chat when the setting is on", async (preset) => {
		expect(await opensInChat(preset, chatSetting(true).read)).toBe(true);
	});

	test.each(
		CHAT_PRESETS,
	)("%s stays in the terminal when the setting is off", async (preset) => {
		expect(await opensInChat(preset, chatSetting(false).read)).toBe(false);
	});

	const terminalOnly = [
		...BUILTIN_AGENT_IDS.filter((id) => !CHAT_PRESETS.includes(id)),
		"my-custom-agent",
		"data:image/png;base64,AAAA",
		null,
		undefined,
	];
	test.each(
		terminalOnly,
	)("%s stays in the terminal and never reads the setting", async (preset) => {
		const setting = chatSetting(true);
		expect(await opensInChat(preset, setting.read)).toBe(false);
		expect(setting.reads()).toBe(0);
	});

	test("every chat preset is a built-in agent", () => {
		for (const preset of CHAT_PRESETS) {
			expect(BUILTIN_AGENT_IDS as readonly string[]).toContain(preset);
		}
	});
});

describe("agentLaunchPreset", () => {
	test("an omp command on a pi config launches as omp, which has no chat", async () => {
		const agent = {
			presetId: "pi",
			launchPresetId: resolveAgentLaunchPresetId("pi", "omp --yolo"),
		};
		expect(agentLaunchPreset(agent)).toBe("omp");
		expect(
			await opensInChat(agentLaunchPreset(agent), chatSetting(true).read),
		).toBe(false);
	});

	test("falls back to the preset, then the icon", () => {
		expect(agentLaunchPreset({ presetId: "codex", iconId: "x" })).toBe("codex");
		expect(agentLaunchPreset({ iconId: "claude" })).toBe("claude");
		expect(agentLaunchPreset({})).toBeNull();
	});
});
