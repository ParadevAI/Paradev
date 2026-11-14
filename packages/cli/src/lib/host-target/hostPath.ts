import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { CLIError } from "@superset/cli-framework";
import type { ResolvedHostTarget } from "./resolveHostTarget";

/** This machine resolves a folder against the cwd; another host needs it absolute. */
export function hostPath(target: ResolvedHostTarget, dir: string): string {
	if (target.kind === "local") {
		const expanded =
			dir === "~" || dir.startsWith("~/") ? `${homedir()}${dir.slice(1)}` : dir;
		return resolve(expanded);
	}
	if (!isAbsolute(dir)) {
		throw new CLIError(
			`${dir} is not an absolute path`,
			`Give the full path of the folder on host ${target.hostId}`,
		);
	}
	return dir;
}
