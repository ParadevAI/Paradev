import { z } from "zod";

/** A CLI request to purge empty sidebar folders, served by a desktop window of `organizationId`. */
export const sidebarFolderPruneRequestSchema = z.object({
	organizationId: z.string().min(1),
	projectId: z.string().min(1).optional(),
	dryRun: z.boolean().optional(),
});

export type SidebarFolderPruneRequest = z.infer<
	typeof sidebarFolderPruneRequestSchema
>;

export interface SidebarFolder {
	/** Null for the Sessions lane. */
	projectId: string | null;
	projectName: string | null;
	tag: string;
	name: string;
}

export interface SidebarFolderPruneResult {
	dryRun: boolean;
	/** Removed, or on a dry run the folders that would be. */
	removed: SidebarFolder[];
	/** Looked empty, but a host or the cloud list could not confirm it. */
	skipped: SidebarFolder[];
	failed: (SidebarFolder & { error: string })[];
}

export const SIDEBAR_REQUEST_ERROR_CODES = [
	"BAD_REQUEST",
	"PRECONDITION_FAILED",
] as const;
export type SidebarRequestErrorCode =
	(typeof SIDEBAR_REQUEST_ERROR_CODES)[number];
