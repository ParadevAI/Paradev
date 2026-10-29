import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { fileToBase64 } from "renderer/lib/file-to-base64";

// Pastes follow the shared workspace-attachments convention (same directory
// and naming as agent-launch and the mobile composer): worktree-relative
// paths, since `filesystem.writeFile` refuses paths outside the worktree.
// The directory self-ignores (see the `.gitignore` write below) so
// attachments never dirty git status.

/** Collision-probe cap; matches the spirit of createUniqueEntry's bound. */
const MAX_NAME_ATTEMPTS = 50;

// Same caps as the agent-launch adapter's attachment writer. The bytes are
// FileReader-read and base64'd (~1.33x) in renderer memory, then travel as
// one JSON body — an accidentally pasted multi-GB Finder file must fail
// fast instead of stalling the renderer and the host.
const MAX_SINGLE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** Thrown for limits the user can act on; the message is toast-ready. */
export class PasteUploadLimitError extends Error {}

function formatMb(bytes: number): string {
	return `${Math.round(bytes / 1024 / 1024)}MB`;
}

interface FsWriteOutcome {
	ok: boolean;
	reason?: string;
}

export interface UploadPastedFilesDeps {
	createDirectory(input: {
		workspaceId: string;
		absolutePath: string;
		recursive: boolean;
	}): Promise<unknown>;
	writeFile(input: {
		workspaceId: string;
		absolutePath: string;
		content: string | { kind: "base64"; data: string };
		options: { create: boolean; overwrite: boolean };
	}): Promise<FsWriteOutcome>;
	/**
	 * Set only when the workspace is on this machine. Files with a disk path
	 * are then copied in place, so the upload size limits do not apply.
	 */
	local?: {
		pathOf(file: File): string;
		copyFile(input: {
			sourcePath: string;
			destinationPath: string;
		}): Promise<FsWriteOutcome>;
	};
}

const MIME_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
	"image/tiff": "tiff",
	"image/bmp": "bmp",
};

/**
 * Clipboard names (Chromium synthesizes "image.png" for screenshots; Finder
 * copies keep their real name) go through the shared sanitizer; generated
 * fallbacks take their extension from the mime type, the only signal a
 * clipboard file carries.
 */
function baseFileName(file: File, index: number): string {
	const sanitized = sanitizeAttachmentFileName(file.name);
	if (sanitized) return sanitized;
	const extension = MIME_EXTENSIONS[file.type];
	return attachmentFallbackName(index, extension ? `.${extension}` : "");
}

/**
 * Write one file under a collision-free name. The batch conventions dedupe
 * against an in-memory set; pastes arrive one at a time across a session, so
 * probe the real directory instead (create-only writes report "exists") —
 * a second screenshot must never overwrite a path an earlier prompt already
 * references.
 */
async function writeUnique(
	base: string,
	write: (fileName: string) => Promise<FsWriteOutcome>,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const fileName = attachmentNameWithSuffix(base, attempt);
		const outcome = await write(fileName);
		if (outcome.ok !== false) return fileName;
		if (outcome.reason !== "exists") {
			throw new Error(outcome.reason ?? "write failed");
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}

/**
 * Write files into the workspace's attachments directory and return the
 * worktree-relative paths written. Throws on the first failed write — the
 * caller owns the error surface.
 */
export async function uploadPastedFiles(options: {
	deps: UploadPastedFilesDeps;
	workspaceId: string;
	worktreePath: string;
	files: File[];
}): Promise<string[]> {
	const { deps, workspaceId, worktreePath, files } = options;
	const dirAbs = `${worktreePath}/${WORKSPACE_ATTACHMENTS_DIR}`;

	const localPaths = files.map((file) => deps.local?.pathOf(file) ?? "");
	const limitScope = deps.local ? "uploaded" : "sent to a remote workspace";

	let totalBytes = 0;
	for (const [index, file] of files.entries()) {
		if (localPaths[index]) continue;
		if (file.size > MAX_SINGLE_FILE_BYTES) {
			throw new PasteUploadLimitError(
				`"${file.name || "pasted file"}" is ${formatMb(file.size)} — files over ${formatMb(MAX_SINGLE_FILE_BYTES)} can't be ${limitScope}`,
			);
		}
		totalBytes += file.size;
	}
	if (totalBytes > MAX_TOTAL_BYTES) {
		throw new PasteUploadLimitError(
			`Pasted files total ${formatMb(totalBytes)} — more than the ${formatMb(MAX_TOTAL_BYTES)} limit for ${deps.local ? "an upload" : "a remote workspace"}`,
		);
	}

	await deps.createDirectory({
		workspaceId,
		absolutePath: dirAbs,
		recursive: true,
	});

	// `*` ignores every attachment and the .gitignore itself, so agents never
	// see attachments as untracked changes. create-only: a user's own edit wins.
	const ignoreOutcome = await deps.writeFile({
		workspaceId,
		absolutePath: `${dirAbs}/.gitignore`,
		content: "*\n",
		options: { create: true, overwrite: false },
	});
	if (ignoreOutcome.ok === false && ignoreOutcome.reason !== "exists") {
		throw new Error(ignoreOutcome.reason ?? "write failed");
	}

	const paths: string[] = [];
	for (const [index, file] of files.entries()) {
		const sourcePath = localPaths[index];
		const data = sourcePath ? null : await fileToBase64(file);
		const write = (fileName: string): Promise<FsWriteOutcome> => {
			const absolutePath = `${dirAbs}/${fileName}`;
			if (sourcePath && deps.local) {
				return deps.local.copyFile({
					sourcePath,
					destinationPath: absolutePath,
				});
			}
			return deps.writeFile({
				workspaceId,
				absolutePath,
				content: { kind: "base64", data: data ?? "" },
				options: { create: true, overwrite: false },
			});
		};
		const fileName = await writeUnique(baseFileName(file, index), write);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
	}
	return paths;
}
