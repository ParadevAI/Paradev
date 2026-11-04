import { existsSync } from "node:fs";
import {
	cp,
	mkdir,
	readdir,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";
import { claudeSessionPath } from "../../../terminal-agents/harness-sessions/claude";
import { isPlainSessionId, type TeleportProvider } from "../types";
import { rehomeClaudeLines } from "./rehomeClaudeLines/rehomeClaudeLines";

const SESSION_DIR = "session";

/**
 * Claude keeps a session in `<id>.jsonl`, and its subagents and large tool
 * outputs in `<id>/` next to it. A subagent can only be continued after a
 * move when its file came along.
 */
export const claudeTeleportProvider: TeleportProvider = {
	harnesses: ["claude-acp", "claude-code"],

	async collect({ harnessSessionId, worktreePath, locate, stageDir }) {
		const mainFile = await locate();
		if (!mainFile) {
			throw new Error("Could not find this conversation's Claude session file");
		}
		const sourceDir = dirname(mainFile);
		const target = join(stageDir, SESSION_DIR);
		await mkdir(target, { recursive: true });
		await cp(mainFile, join(target, basename(mainFile)));
		const folder = join(sourceDir, harnessSessionId);
		if (existsSync(folder)) {
			await cp(folder, join(target, harnessSessionId), { recursive: true });
		}
		return {
			version: 1,
			harnessSessionId,
			sourceCwd: await realpath(worktreePath),
			sourceDir,
		};
	},

	async place({ manifest, worktreePath, env, stageDir }) {
		const id = manifest.harnessSessionId;
		if (!isPlainSessionId(id)) {
			throw new Error("The moved conversation has an invalid session id");
		}
		const cwd = await realpath(worktreePath);
		const destination = dirname(claudeSessionPath(env, cwd, id));
		const from = { cwd: manifest.sourceCwd, dir: manifest.sourceDir };
		const to = { cwd, dir: destination };
		const source = join(stageDir, SESSION_DIR);
		for (const relative of await listFiles(source)) {
			if (relative !== `${id}.jsonl` && !relative.startsWith(`${id}${sep}`)) {
				continue;
			}
			const target = join(destination, relative);
			await mkdir(dirname(target), { recursive: true });
			const content = await readFile(join(source, relative));
			await writeFile(
				target,
				relative.endsWith(".jsonl")
					? rehomeClaudeLines(content.toString("utf8"), from, to)
					: content,
				{ mode: 0o600 },
			);
		}
	},
};

async function listFiles(root: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(join(root, prefix), { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const relative = prefix ? join(prefix, entry.name) : entry.name;
		if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
		else if (entry.isFile()) files.push(relative);
	}
	return files;
}
