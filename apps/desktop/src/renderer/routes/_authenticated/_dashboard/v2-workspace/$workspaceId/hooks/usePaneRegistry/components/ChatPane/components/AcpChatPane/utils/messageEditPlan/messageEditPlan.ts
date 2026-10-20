import type { ChatTransport } from "@superset/chat/client";
import { TRPCClientError } from "@trpc/client";

type RewindChanges = Awaited<ReturnType<ChatTransport["getRewindChanges"]>>;
type MessageEditPlan =
	| { kind: "keep-files" }
	| {
			kind: "confirm";
			changes: Extract<RewindChanges, { files: "listed" }>["changes"];
	  };

export async function messageEditPlan({
	canRewindFiles,
	loadChanges,
}: {
	canRewindFiles: boolean;
	loadChanges: () => Promise<RewindChanges>;
}): Promise<MessageEditPlan> {
	if (!canRewindFiles) return { kind: "keep-files" };
	let changes: RewindChanges;
	try {
		changes = await loadChanges();
	} catch (error) {
		if (
			error instanceof TRPCClientError &&
			/No procedure/.test(error.message)
		) {
			return { kind: "keep-files" };
		}
		throw error;
	}
	if (changes.files !== "listed" || changes.changes.length === 0) {
		return { kind: "keep-files" };
	}
	return { kind: "confirm", changes: changes.changes };
}
