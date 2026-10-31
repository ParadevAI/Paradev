import { statSync } from "node:fs";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { TRPCError } from "@trpc/server";

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

/**
 * The editor takes an absolute path and Changes a path relative to the
 * worktree; an agent may pass either form.
 */
export function resolveOpenPath(
	tool: "file" | "changes",
	path: string,
	worktreePath: string,
	fileExists: (path: string) => boolean = isFile,
): string {
	if (tool === "file") {
		const absolute = isAbsolute(path) ? path : resolve(worktreePath, path);
		if (!fileExists(absolute)) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: `No file ${path} in this workspace`,
			});
		}
		return absolute;
	}
	const relativePath = normalize(
		isAbsolute(path) ? relative(worktreePath, path) : path,
	);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${path} is outside this workspace, so it has no changes to show`,
		});
	}
	return relativePath;
}
