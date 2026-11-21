import type { MessageDescriptor } from "@lingui/core";
import type { AgentId } from "@/app/[lang]/components/AgentLogo";

export type ActiveDemo =
	| "Orchestrate Parallel Agents"
	| "Cloud Workspaces"
	| "Automate Tasks"
	| "Publish Pages";

export type PagePhase = "published" | "commented" | "revised";

export type SessionStatus = "needs" | "working";

export type RailSection = "workspaces" | "automations" | "pages";

export interface SessionData {
	title: string;
	agent: AgentId;
	status?: SessionStatus;
}

export interface SessionGroupData {
	id: string;
	label: string | MessageDescriptor;
	sessions: SessionData[];
}

export interface SceneConfig {
	rail: RailSection;
	activeSession: string | null;
	showChanges: boolean;
}

export type DiffRow =
	| { kind: "separator"; lines: number }
	| {
			kind: "line";
			number: number;
			change?: "add" | "del";
			code: string;
			mark?: string;
	  };

export interface FileDiffData {
	path: string;
	add: number;
	del?: number;
	rows: DiffRow[];
}

export interface AppMockupProps {
	activeDemo?: ActiveDemo;
	edgeGlare?: boolean;
}
