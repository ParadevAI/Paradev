import type { FileStatus } from "renderer/routes/_authenticated/_dashboard/components/StatusIndicator";

export type DiffRef =
	| { kind: "against-base"; baseBranch: string | null }
	| { kind: "uncommitted" }
	| {
			kind: "commit";
			commitHash: string;
			fromHash?: string;
			includeFrom?: boolean;
	  };

export type DiffFileSource =
	| { kind: "against-base"; baseBranch: string | null }
	| { kind: "staged" }
	| { kind: "unstaged" }
	| {
			kind: "commit";
			commitHash: string;
			fromHash?: string;
			includeFrom?: boolean;
	  };

export interface ChangesetFile {
	path: string;
	oldPath?: string;
	status: FileStatus;
	additions: number | null;
	deletions: number | null;
	isBinary?: boolean;
	source: DiffFileSource;
}
