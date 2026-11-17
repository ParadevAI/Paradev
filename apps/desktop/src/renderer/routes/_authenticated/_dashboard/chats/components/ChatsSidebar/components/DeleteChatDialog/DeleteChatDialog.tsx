import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";

interface DeleteChatDialogProps {
	/** The chat to delete, or null when the dialog is closed. */
	chat: { title: string; kind: "direct" | "group" } | null;
	onCancel: () => void;
	onConfirm: () => void;
}

/** Asks before a group or a Dev is deleted from the sidebar. */
export function DeleteChatDialog({
	chat,
	onCancel,
	onConfirm,
}: DeleteChatDialogProps) {
	const title = chat?.title ?? "";
	return (
		<AlertDialog
			open={chat !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Delete {title}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						{chat?.kind === "group" ? (
							<Trans>
								This deletes the group and its messages for everyone in it. It
								cannot be undone.
							</Trans>
						) : (
							<Trans>
								This deletes the Dev and your chat with it, and takes it out of
								every group. It cannot be undone.
							</Trans>
						)}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						<Trans>Delete</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
