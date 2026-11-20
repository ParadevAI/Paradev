import { isStartingMode } from "@superset/chat/core";

/**
 * Modes saved here before the host remembered them. Nothing writes this key
 * now: each agent's entry moves to the host on its next new chat, then goes.
 */
const STORAGE_KEY = "chatModeByAgent";

type SavedModes = Record<string, string>;

function readSavedModes(): SavedModes {
	try {
		const parsed: unknown = JSON.parse(
			window.localStorage.getItem(STORAGE_KEY) ?? "{}",
		);
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	} catch {
		return {};
	}
}

export function withoutSavedMode(
	saved: SavedModes,
	presetId: string,
): SavedModes | null {
	const { [presetId]: _forgotten, ...rest } = saved;
	return Object.keys(rest).length > 0 ? rest : null;
}

export function freshStartMode(
	paneModeId: string | undefined,
	savedModeId: string | undefined,
): string | undefined {
	return paneModeId && isStartingMode(paneModeId) ? paneModeId : savedModeId;
}

export function readSavedChatMode(presetId: string): string | undefined {
	return readSavedModes()[presetId];
}

export function forgetSavedChatMode(presetId: string): void {
	try {
		const rest = withoutSavedMode(readSavedModes(), presetId);
		if (rest) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
		else window.localStorage.removeItem(STORAGE_KEY);
	} catch {}
}
