import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { assertFitsHost, type ChatAttachmentFile } from "./chatParts";

const MAX_NAME_ATTEMPTS = 50;

export interface WorktreeWriteDeps {
	worktreePath: () => Promise<string>;
	createDirectory: (absolutePath: string) => Promise<unknown>;
	writeFile: (input: {
		absolutePath: string;
		content: string | { kind: "base64"; data: string };
	}) => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Worktree-relative paths for a PTY on a machine someone owns: the bytes go to
 * that host in the request and are written create-only, so a later paste never
 * overwrites a path an earlier prompt names.
 */
export async function writeAttachmentsToWorktree(
	files: ChatAttachmentFile[],
	deps: WorktreeWriteDeps,
): Promise<string[]> {
	assertFitsHost(files);

	const dir = `${await deps.worktreePath()}/${WORKSPACE_ATTACHMENTS_DIR}`;
	await deps.createDirectory(dir);
	const ignore = await deps.writeFile({
		absolutePath: `${dir}/.gitignore`,
		content: "*\n",
	});
	if (!ignore.ok && ignore.reason !== "exists") {
		throw new Error(ignore.reason ?? "write failed");
	}

	const paths: string[] = [];
	for (const [index, file] of files.entries()) {
		const base =
			sanitizeAttachmentFileName(file.name) ?? attachmentFallbackName(index);
		const data = await file.readBase64();
		const name = await writeUnique(deps, dir, base, data);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${name}`);
	}
	return paths;
}

async function writeUnique(
	deps: WorktreeWriteDeps,
	dir: string,
	base: string,
	data: string,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const name = attachmentNameWithSuffix(base, attempt);
		const outcome = await deps.writeFile({
			absolutePath: `${dir}/${name}`,
			content: { kind: "base64", data },
		});
		if (outcome.ok) return name;
		if (outcome.reason !== "exists") {
			throw new Error(outcome.reason ?? "write failed");
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}
