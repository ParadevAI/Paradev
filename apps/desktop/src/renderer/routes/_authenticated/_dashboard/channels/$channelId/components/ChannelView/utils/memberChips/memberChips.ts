import type { ComposerChip } from "@superset/chat-ui/PromptInput";

const AGENT_KEY = "channelAgentWorkspaceId";
const DEV_KEY = "channelDevActorId";

function dataValue(chip: { data?: unknown }, key: string): string | null {
	const data = chip.data;
	if (typeof data !== "object" || data === null) return null;
	const value = (data as Record<string, unknown>)[key];
	return typeof value === "string" ? value : null;
}

/** "@name" for one of the channel's agents, drawn as a mention. */
export function agentChip(workspace: {
	id: string;
	name: string;
	branch: string;
}): ComposerChip {
	return {
		label: `@${workspace.name}`,
		serialized: `@${workspace.name}`,
		description: workspace.branch,
		variant: "member",
		data: { [AGENT_KEY]: workspace.id },
	};
}

/** "@name" for one of the channel's Devs, drawn as a mention. */
export function devChip(dev: { actorId: string; name: string }): ComposerChip {
	return {
		label: `@${dev.name}`,
		serialized: `@${dev.name}`,
		variant: "member",
		data: { [DEV_KEY]: dev.actorId },
	};
}

/** The workspace of the agent a chip names, if it names one. */
export function chipAgentId(chip: { data?: unknown }): string | null {
	return dataValue(chip, AGENT_KEY);
}

/** The actor id of the Dev a chip names, if it names one. */
export function chipDevId(chip: { data?: unknown }): string | null {
	return dataValue(chip, DEV_KEY);
}

function namesInText(text: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^\\w@])@${escaped}(?![\\w-])`, "i").test(text);
}

/**
 * The Devs a sent message names: by its chips, or by "@name" in its text
 * once a replayed chat has dropped the chips.
 */
export function mentionedDevIds(
	text: string,
	elements: readonly { data?: unknown }[],
	devs: readonly { actorId: string; name: string }[],
): string[] {
	const ids = new Set(elements.flatMap((element) => chipDevId(element) ?? []));
	for (const dev of devs) {
		if (namesInText(text, dev.name)) ids.add(dev.actorId);
	}
	return [...ids];
}
