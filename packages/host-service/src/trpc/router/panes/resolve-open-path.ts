import { realpathSync, statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { TRPCError } from "@trpc/server";

function realFile(path: string): string | null {
	try {
		const real = realpathSync(path);
		return statSync(real).isFile() ? real : null;
	} catch {
		return null;
	}
}

function realDir(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

function isInside(root: string, path: string): boolean {
	return (
		path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)
	);
}

/**
 * The editor takes an absolute path and Changes a path relative to the
 * worktree; an agent may pass either form. Both must stay inside the
 * worktree, after symlinks are followed.
 */
export function resolveOpenPath(
	tool: "file" | "changes",
	path: string,
	worktreePath: string,
	fs: {
		realFile: (path: string) => string | null;
		realDir: (path: string) => string;
	} = {
		realFile,
		realDir,
	},
): string {
	const outside = new TRPCError({
		code: "BAD_REQUEST",
		message: `${path} is outside this workspace`,
	});
	if (tool === "file") {
		const candidate = isAbsolute(path) ? path : resolve(worktreePath, path);
		const real = fs.realFile(candidate);
		if (!real) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `No file ${path} in this workspace`,
			});
		}
		if (!isInside(fs.realDir(worktreePath), real)) throw outside;
		return real;
	}
	const relativePath = normalize(
		isAbsolute(path) ? relative(worktreePath, path) : path,
	);
	if (
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		throw outside;
	}
	return relativePath;
}
