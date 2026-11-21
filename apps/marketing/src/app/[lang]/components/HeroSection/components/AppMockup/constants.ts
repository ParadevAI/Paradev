import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	ActiveDemo,
	FileDiffData,
	PagePhase,
	SceneConfig,
	SessionData,
	SessionGroupData,
} from "./types";

export const CLOUD_GROUP_ID = "paradev/cloud";

export const NEW_CLOUD_SESSION: SessionData = {
	title: "Nightly evals",
	agent: "claude",
	status: "working",
};

export const SESSION_GROUPS: SessionGroupData[] = [
	{
		id: "pinned",
		label: msg({ message: "Pinned" }),
		sessions: [
			{ title: "Settings → modal", agent: "claude", status: "needs" },
			{ title: "Command palette v2", agent: "codex" },
		],
	},
	{
		id: "working",
		label: msg({ message: "Working" }),
		sessions: [
			{ title: "Fix flaky auth tests", agent: "opencode", status: "working" },
			{ title: "Linear → PR automation", agent: "cursor", status: "working" },
		],
	},
	{
		id: "paradev/desktop",
		label: "paradev/desktop",
		sessions: [
			{ title: "Publish pricing comparison", agent: "gemini", status: "needs" },
			{ title: "Terminal go brrr", agent: "vibe" },
		],
	},
	{
		id: "paradev/web",
		label: "paradev/web",
		sessions: [
			{ title: "Onboarding copy pass", agent: "pi", status: "needs" },
			{ title: "Changelog page", agent: "kiro" },
		],
	},
	{
		id: CLOUD_GROUP_ID,
		label: "paradev/cloud",
		sessions: [
			{ title: "Team usage panel", agent: "devin" },
			{ title: "Sentry triage → issues", agent: "grok" },
		],
	},
];

export const SCENES: Record<ActiveDemo, SceneConfig> = {
	"Orchestrate Parallel Agents": {
		rail: "workspaces",
		activeSession: "Settings → modal",
		showChanges: true,
	},
	"Cloud Workspaces": {
		rail: "workspaces",
		activeSession: NEW_CLOUD_SESSION.title,
		showChanges: false,
	},
	"Automate Tasks": {
		rail: "automations",
		activeSession: null,
		showChanges: false,
	},
	"Publish Pages": {
		rail: "pages",
		activeSession: "Onboarding copy pass",
		showChanges: true,
	},
};

export const FILE_DIFFS: FileDiffData[] = [
	{
		path: "src/hotkeys/useHotkeys.ts",
		add: 27,
		rows: [
			{ kind: "separator", lines: 11 },
			{ kind: "line", number: 12, code: 'import { useEffect } from "react";' },
			{
				kind: "line",
				number: 13,
				code: 'import { hotkeys } from "./registry";',
			},
			{
				kind: "line",
				number: 14,
				change: "add",
				code: 'import { openSettings } from "@/settings";',
			},
			{ kind: "line", number: 15, code: "" },
			{
				kind: "line",
				number: 16,
				code: "export function useHotkeys(scope: Scope) {",
			},
			{ kind: "line", number: 17, code: "  useEffect(function bind() {" },
			{
				kind: "line",
				number: 18,
				change: "add",
				code: "    // ⌘, opens Settings from anywhere",
			},
			{
				kind: "line",
				number: 19,
				change: "add",
				code: '    hotkeys.bind("mod+comma", openSettings,',
			},
			{
				kind: "line",
				number: 20,
				change: "add",
				code: "      { global: true });",
			},
			{ kind: "line", number: 21, code: "    return hotkeys.attach(scope);" },
			{ kind: "separator", lines: 38 },
		],
	},
];

export interface AutomationRow {
	name: string;
	schedule: MessageDescriptor;
	lastRun: MessageDescriptor;
	running?: boolean;
}

export const AUTOMATIONS: AutomationRow[] = [
	{
		name: "daily-triage",
		schedule: msg({
			message: "daily 9:00",
		}),
		lastRun: msg({
			message: "running",
		}),
		running: true,
	},
	{
		name: "changelog-draft",
		schedule: msg({
			message: "sun 11:00",
		}),
		lastRun: msg({
			message: "✓ 2h ago",
		}),
	},
	{
		name: "dep-upgrades",
		schedule: msg({
			message: "weekly",
		}),
		lastRun: msg({
			message: "✓ 1d ago",
		}),
	},
	{
		name: "pr-review",
		schedule: msg({
			message: "on review request",
		}),
		lastRun: msg({
			message: "✓ 12m ago",
		}),
	},
];

export const PAGE_PHASES: readonly PagePhase[] = [
	"published",
	"commented",
	"revised",
];

export const PAGE_PHASE_MS = [1800, 2400, 5000] as const;
