import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute } from "node:path";

type Env = Record<string, string | undefined>;

function isExecutableFile(path: string): boolean {
	try {
		if (!statSync(path).isFile()) return false;
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function searchPath(name: string, pathValue: string): string | null {
	for (const dir of pathValue.split(delimiter)) {
		// execvp resolves "" and relative entries against the child's cwd.
		// Hand those back to it rather than guess which file it would pick.
		if (!isAbsolute(dir)) return null;
		// Not path.join: it folds "link/.." as text, the kernel follows the link.
		const candidate = `${dir}/${name}`;
		if (isExecutableFile(candidate)) return candidate;
	}
	return null;
}

/**
 * Absolute path for `name`, so a spawn does not walk PATH itself. On macOS
 * libuv calls posix_spawn once per PATH entry, and every miss takes a PID.
 * A stat per entry costs no PID, so the lookup runs on every call.
 * `preferred` paths win over PATH. Falls back to the bare name when nothing
 * matches, so the spawn still fails or succeeds as before.
 */
export function resolveCommand(
	name: string,
	{
		env = process.env,
		preferred = [],
	}: { env?: Env; preferred?: string[] } = {},
): string {
	if (process.platform === "win32" || name.includes("/")) return name;

	return (
		preferred.find(isExecutableFile) ?? searchPath(name, env.PATH ?? "") ?? name
	);
}
