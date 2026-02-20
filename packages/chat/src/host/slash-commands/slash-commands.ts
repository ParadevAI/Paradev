import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface SlashCommand {
	name: string;
	description: string;
	argumentHint: string;
}

/**
 * Scan `.claude/commands/*.md` for custom slash commands.
 * Project-local commands (under `cwd`) take priority over user-global ones.
 */
export function getSlashCommands(cwd: string): SlashCommand[] {
	const dirs = [
		join(cwd, ".claude", "commands"),
		join(homedir(), ".claude", "commands"),
	];
	const commands: SlashCommand[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const name = file.replace(/\.md$/, "");
				if (seen.has(name)) continue;
				seen.add(name);
				const raw = readFileSync(join(dir, file), "utf-8");
				const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
				const descMatch = fmMatch?.[1]?.match(/^description:\s*(.+)$/m);
				const argMatch = fmMatch?.[1]?.match(/^argument-hint:\s*(.+)$/m);
				commands.push({
					name,
					description: descMatch?.[1]?.trim() ?? "",
					argumentHint: argMatch?.[1]?.trim() ?? "",
				});
			}
		} catch (err) {
			console.warn(
				`[slash-commands] Failed to read commands from ${dir}:`,
				err,
			);
		}
	}

	return commands;
}
