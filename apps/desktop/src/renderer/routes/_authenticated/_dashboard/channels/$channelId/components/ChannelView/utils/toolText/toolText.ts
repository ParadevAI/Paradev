import type { ToolCall } from "@superset/chat/protocol";
import { toolCallCommand } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/components/Transcript/utils/shellIntent";

/** The shell command a tool call ran, however the harness stored it. */
export function toolCommand(tool: ToolCall): string {
	return toolCallCommand(tool) ?? tool.title;
}

/** Everything a tool call printed, text and terminal content alike. */
export function toolOutput(tool: ToolCall): string {
	return tool.content
		.map((content) =>
			content.type === "text"
				? content.text
				: content.type === "terminal"
					? content.output
					: "",
		)
		.filter(Boolean)
		.join("\n");
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The value of `--flag <uuid>` in a command, when there is one. */
export function uuidOption(command: string, flag: string): string | null {
	const match = new RegExp(`--${flag}(?:=|\\s+)['"]?(${UUID})`, "i").exec(
		command,
	);
	return match?.[1] ?? null;
}

/** The value of `--flag <word>` in a command: one unquoted token. */
export function wordOption(command: string, flag: string): string | null {
	const match = new RegExp(`--${flag}(?:=|\\s+)['"]?([^\\s'"]+)`).exec(command);
	return match?.[1] ?? null;
}

/**
 * The value of `--flag "…"`, `--flag '…'`, `--flag $'…'` or
 * `--flag "$(cat <<'EOF' … EOF)"` in a command, unescaped.
 */
export function quotedOption(command: string, flag: string): string | null {
	const at = command.search(new RegExp(`--${flag}(?:=|\\s+)`));
	if (at === -1) return null;
	const rest = command
		.slice(at)
		.replace(new RegExp(`^--${flag}(?:=|\\s+)`), "");
	const heredoc =
		/^"?\$\(\s*cat\s+<<-?\s*'?(\w+)'?\s*\n([\s\S]*?)\n\s*\1\b/.exec(rest);
	if (heredoc?.[2] !== undefined) return heredoc[2];
	if (rest.startsWith("$'")) {
		const match = /^\$'((?:[^'\\]|\\[\s\S])*)'/.exec(rest);
		return match?.[1] === undefined
			? null
			: match[1].replace(/\\n/g, "\n").replace(/\\(['\\])/g, "$1");
	}
	if (rest.startsWith('"')) {
		const match = /^"((?:[^"\\]|\\[\s\S])*)"/.exec(rest);
		return match?.[1] === undefined
			? null
			: match[1].replace(/\\(["\\$`])/g, "$1");
	}
	if (rest.startsWith("'")) {
		const match = /^'([^']*)'/.exec(rest);
		return match?.[1] ?? null;
	}
	return /^(\S+)/.exec(rest)?.[1] ?? null;
}

/** The first line of a text that says something, trimmed to `max` characters. */
export function firstLine(text: string, max: number): string | null {
	const line = text
		.split("\n")
		.map((candidate) => candidate.replace(/^#+\s*/, "").trim())
		.find(Boolean);
	if (!line) return null;
	return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** The JSON object starting at the brace at `start`, nested braces and quoted braces included. */
export function balancedObject(text: string, start: number): string | null {
	let depth = 0;
	let inString = false;
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (inString) {
			if (char === "\\") index += 1;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return text.slice(start, index + 1);
		}
	}
	return null;
}

/** The first JSON object in a text, parsed; null when there is none or it does not parse. */
export function firstJsonObject(text: string): Record<string, unknown> | null {
	const start = text.indexOf("{");
	if (start === -1) return null;
	const object = balancedObject(text, start);
	if (!object) return null;
	try {
		const parsed: unknown = JSON.parse(object);
		return typeof parsed === "object" && parsed !== null
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}
