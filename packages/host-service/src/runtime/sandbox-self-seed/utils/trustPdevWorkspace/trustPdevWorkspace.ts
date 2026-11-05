import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function pdevAgentDir(env: NodeJS.ProcessEnv = process.env): string {
	return env.PDEV_CODING_AGENT_DIR || join(homedir(), ".paradev", "agent");
}

/**
 * pdev stops on a "Trust project folder?" prompt in a project it has not seen,
 * and a launch nobody is watching would sit on it. Records the workspace root
 * the way the prompt's "Trust" answer would, in pdev's `trust.json`; an entry
 * covers every folder under it. A decision already recorded for the root,
 * including "do not trust", is left alone.
 */
export function trustPdevWorkspace(root: string, agentDir: string): void {
	const path = join(agentDir, "trust.json");
	let trust: Record<string, unknown> = {};
	if (existsSync(path)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
				throw new Error("not an object");
			trust = parsed as Record<string, unknown>;
		} catch (error) {
			// pdev refuses to start on a trust store it cannot parse, so
			// overwriting it would hide the problem rather than fix it.
			console.warn(
				`[sandbox] ${path} is not readable JSON, workspace not trusted`,
				error,
			);
			return;
		}
	}
	if (trust[root] === true || trust[root] === false) return;
	trust[root] = true;
	const sorted = Object.fromEntries(
		Object.keys(trust)
			.sort()
			.map((key) => [key, trust[key]]),
	);
	mkdirSync(agentDir, { recursive: true });
	// Renamed into place: a write cut short would otherwise leave a store pdev
	// refuses to start on.
	const next = `${path}.${process.pid}.tmp`;
	writeFileSync(next, `${JSON.stringify(sorted, null, 2)}\n`);
	renameSync(next, path);
}
