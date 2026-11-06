import { constants } from "node:fs";
import { copyFile, open, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { ensureWorkspaceAttachmentsDir } from "@superset/shared/workspace-attachments-dir";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const MAX_NAME_ATTEMPTS = 50;

const itemSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("path"), sourcePath: z.string().min(1) }),
	z.object({
		kind: z.literal("base64"),
		name: z.string(),
		data: z.string().max(Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4),
	}),
]);

export type LocalAttachmentItem = z.infer<typeof itemSchema>;

export type AttachmentSourceProblem = "missing" | "not-a-file" | "unreadable";

export type WriteAttachmentsResult =
	| { ok: true; paths: string[] }
	| { ok: false; index: number; problem: AttachmentSourceProblem };

function badRequest(message: string): TRPCError {
	return new TRPCError({ code: "BAD_REQUEST", message });
}

// Windows opens an SMB connection for a UNC path, which can leak the user's NTLM hash.
function assertLocalAbsolute(path: string): void {
	if (!isAbsolute(path) || /^[\\/]{2}/.test(path)) {
		throw badRequest(`Not a local absolute path: ${path}`);
	}
}

function errnoOf(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | null)?.code;
}

async function sourceProblem(
	sourcePath: string,
): Promise<AttachmentSourceProblem | null> {
	try {
		if (!(await stat(sourcePath)).isFile()) return "not-a-file";
		await (await open(sourcePath, "r")).close();
		return null;
	} catch (error) {
		const code = errnoOf(error);
		if (code === "ENOENT" || code === "ENOTDIR") return "missing";
		if (code === "EACCES" || code === "EPERM") return "unreadable";
		throw error;
	}
}

async function assertWorktree(worktreePath: string): Promise<void> {
	assertLocalAbsolute(worktreePath);
	if (!(await stat(worktreePath)).isDirectory()) {
		throw badRequest(`Not a directory: ${worktreePath}`);
	}
}

function baseNameOf(item: LocalAttachmentItem, index: number): string {
	const raw = item.kind === "path" ? basename(item.sourcePath) : item.name;
	return sanitizeAttachmentFileName(raw) ?? attachmentFallbackName(index);
}

async function writeExclusive(
	item: LocalAttachmentItem,
	destination: string,
): Promise<void> {
	if (item.kind === "path") {
		await copyFile(item.sourcePath, destination, constants.COPYFILE_EXCL);
		return;
	}
	await writeFile(destination, Buffer.from(item.data, "base64"), {
		flag: "wx",
	});
}

async function writeUnique(
	item: LocalAttachmentItem,
	directory: string,
	base: string,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const fileName = attachmentNameWithSuffix(base, attempt);
		try {
			await writeExclusive(item, join(directory, fileName));
			return fileName;
		} catch (error) {
			if (errnoOf(error) !== "EEXIST") throw error;
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}

export async function writeAttachmentsIntoWorktree(input: {
	worktreePath: string;
	items: LocalAttachmentItem[];
}): Promise<WriteAttachmentsResult> {
	await assertWorktree(input.worktreePath);
	for (const [index, item] of input.items.entries()) {
		if (item.kind !== "path") continue;
		assertLocalAbsolute(item.sourcePath);
		const problem = await sourceProblem(item.sourcePath);
		if (problem) return { ok: false, index, problem };
	}
	const directory = ensureWorkspaceAttachmentsDir(input.worktreePath);
	const paths: string[] = [];
	for (const [index, item] of input.items.entries()) {
		const fileName = await writeUnique(
			item,
			directory,
			baseNameOf(item, index),
		);
		paths.push(`${WORKSPACE_ATTACHMENTS_DIR}/${fileName}`);
	}
	return { ok: true, paths };
}

export const createAttachmentsRouter = () => {
	return router({
		writeIntoWorktree: publicProcedure
			.input(
				z.object({
					worktreePath: z.string().min(1),
					items: z.array(itemSchema).min(1).max(MAX_ATTACHMENTS),
				}),
			)
			.mutation(({ input }) => writeAttachmentsIntoWorktree(input)),
	});
};
