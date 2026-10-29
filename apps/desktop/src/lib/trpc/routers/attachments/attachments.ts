import { constants } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import {
	attachmentFallbackName,
	attachmentNameWithSuffix,
	sanitizeAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "@superset/shared/workspace-attachments";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const MAX_NAME_ATTEMPTS = 50;

function isErrno(error: unknown, code: string): boolean {
	return (error as NodeJS.ErrnoException | null)?.code === code;
}

async function ensureAttachmentsDir(worktreePath: string): Promise<string> {
	const directory = join(worktreePath, WORKSPACE_ATTACHMENTS_DIR);
	await mkdir(directory, { recursive: true });
	try {
		await writeFile(join(directory, ".gitignore"), "*\n", { flag: "wx" });
	} catch (error) {
		if (!isErrno(error, "EEXIST")) throw error;
	}
	return directory;
}

export async function copyLocalFilesIntoWorktree(input: {
	worktreePath: string;
	sourcePaths: string[];
}): Promise<string[]> {
	for (const path of [input.worktreePath, ...input.sourcePaths]) {
		if (!isAbsolute(path)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Path is not absolute: ${path}`,
			});
		}
	}
	for (const sourcePath of input.sourcePaths) {
		if (!(await stat(sourcePath)).isFile()) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Not a file: ${sourcePath}`,
			});
		}
	}

	const directory = await ensureAttachmentsDir(input.worktreePath);
	const paths: string[] = [];
	for (const [index, sourcePath] of input.sourcePaths.entries()) {
		const base =
			sanitizeAttachmentFileName(basename(sourcePath)) ??
			attachmentFallbackName(index);
		paths.push(
			`${WORKSPACE_ATTACHMENTS_DIR}/${await copyUnique(sourcePath, directory, base)}`,
		);
	}
	return paths;
}

async function copyUnique(
	sourcePath: string,
	directory: string,
	base: string,
): Promise<string> {
	for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
		const fileName = attachmentNameWithSuffix(base, attempt);
		try {
			await copyFile(
				sourcePath,
				join(directory, fileName),
				constants.COPYFILE_EXCL,
			);
			return fileName;
		} catch (error) {
			if (!isErrno(error, "EEXIST")) throw error;
		}
	}
	throw new Error(`Could not find a free name for ${base}`);
}

export const createAttachmentsRouter = () => {
	return router({
		copyLocalFilesIntoWorktree: publicProcedure
			.input(
				z.object({
					worktreePath: z.string().min(1),
					sourcePaths: z.array(z.string().min(1)).min(1),
				}),
			)
			.mutation(({ input }) => copyLocalFilesIntoWorktree(input)),
	});
};
