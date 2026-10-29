import { constants } from "node:fs";
import { copyFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute } from "node:path";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const [ATTACHMENTS_PARENT_NAME, ATTACHMENTS_DIR_NAME] =
	WORKSPACE_ATTACHMENTS_DIR.split("/");

export function isWorkspaceAttachmentDestination(path: string): boolean {
	const directory = dirname(path);
	return (
		isAbsolute(path) &&
		basename(directory) === ATTACHMENTS_DIR_NAME &&
		basename(dirname(directory)) === ATTACHMENTS_PARENT_NAME
	);
}

export async function copyLocalFileExclusive(input: {
	sourcePath: string;
	destinationPath: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
	if (!isAbsolute(input.sourcePath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Source path is not absolute",
		});
	}
	if (!isWorkspaceAttachmentDestination(input.destinationPath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Destination must be inside ${WORKSPACE_ATTACHMENTS_DIR}`,
		});
	}
	if (!(await stat(input.sourcePath)).isFile()) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Source is not a file",
		});
	}
	try {
		await copyFile(
			input.sourcePath,
			input.destinationPath,
			constants.COPYFILE_EXCL,
		);
		return { ok: true };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") {
			return { ok: false, reason: "exists" };
		}
		throw error;
	}
}

export const createAttachmentsRouter = () => {
	return router({
		copyLocalFile: publicProcedure
			.input(
				z.object({
					sourcePath: z.string().min(1),
					destinationPath: z.string().min(1),
				}),
			)
			.mutation(({ input }) => copyLocalFileExclusive(input)),
	});
};
