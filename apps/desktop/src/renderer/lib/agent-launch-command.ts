import {
	AGENT_PRESET_FEATURE_FLAGS,
	getPresetById,
} from "@superset/shared/host-agent-presets";
import { parse } from "shell-quote";
import { joinCommandArgsWithEnv, parseLaunchCommandString } from "./argv";

export interface AgentLaunchConfig {
	id?: string;
	presetId?: string;
	command: string;
	args: string[];
	env?: Record<string, string>;
}

export interface AgentCommandPatch {
	command: string;
	args: string[];
	env: Record<string, string>;
}

interface LinkedPresetLaunch {
	agentId?: string;
	commands: string[];
}

function areEnvMapsEqual(
	left: Record<string, string>,
	right: Record<string, string>,
): boolean {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) return false;
	return leftEntries.every(([key, value]) => right[key] === value);
}

function hasShellSyntax(commandText: string): boolean {
	return parse(commandText).some((token) => typeof token !== "string");
}

export function getAgentCommandText(agent: AgentLaunchConfig): string {
	if (agent.args.length === 0 && hasShellSyntax(agent.command)) {
		const envPrefix = joinCommandArgsWithEnv("", [], agent.env);
		return envPrefix ? `${envPrefix} ${agent.command}` : agent.command;
	}
	return joinCommandArgsWithEnv(agent.command, agent.args, agent.env);
}

export function parseAgentCommandText(commandText: string): AgentCommandPatch {
	const trimmed = commandText.trim();
	if (hasShellSyntax(trimmed)) {
		return { command: trimmed, args: [], env: {} };
	}
	return parseLaunchCommandString(commandText);
}

export function isAgentCommandPatchChanged(
	agent: AgentLaunchConfig,
	patch: AgentCommandPatch,
): boolean {
	return (
		patch.command !== agent.command ||
		patch.args.length !== agent.args.length ||
		patch.args.some((arg, index) => arg !== agent.args[index]) ||
		!areEnvMapsEqual(patch.env, agent.env ?? {})
	);
}

export function findLinkedAgent<TAgent extends AgentLaunchConfig>(
	agents: readonly TAgent[] | undefined,
	agentId: string | undefined,
): TAgent | null {
	if (!agents || !agentId) return null;
	return (
		agents.find((agent) => agent.id === agentId) ??
		agents.find((agent) => agent.presetId === agentId) ??
		null
	);
}

export function resolvePresetLaunchCommands(
	preset: LinkedPresetLaunch,
	agents: readonly AgentLaunchConfig[] | undefined,
): string[] {
	const linkedAgent = findLinkedAgent(agents, preset.agentId);
	if (linkedAgent?.command.trim()) {
		return [getAgentCommandText(linkedAgent)];
	}
	return preset.commands;
}

type IsAgentPresetEnabled = (presetId: string) => boolean;

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

function commandPrograms(command: string): string[] {
	const programs: string[] = [];
	let atCommandStart = true;
	for (const token of parse(command)) {
		if (typeof token !== "string") {
			atCommandStart = "op" in token && token.op !== "glob";
			continue;
		}
		if (!atCommandStart || ENV_ASSIGNMENT.test(token)) continue;
		programs.push(token.slice(token.lastIndexOf("/") + 1));
		atCommandStart = false;
	}
	return programs;
}

export function runsGatedAgent(
	commands: readonly string[],
	isAgentPresetEnabled: IsAgentPresetEnabled,
): boolean {
	const programs = commands.flatMap(commandPrograms);
	return [...AGENT_PRESET_FEATURE_FLAGS.keys()].some((presetId) => {
		const binary = getPresetById(presetId)?.command;
		return (
			!isAgentPresetEnabled(presetId) &&
			binary !== undefined &&
			programs.includes(binary)
		);
	});
}

export function isTerminalPresetEnabled(
	preset: { name: string; commands: readonly string[] },
	isAgentPresetEnabled: IsAgentPresetEnabled,
): boolean {
	return (
		isAgentPresetEnabled(preset.name) &&
		!runsGatedAgent(preset.commands, isAgentPresetEnabled)
	);
}
