import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	EnterEnabledAlertDialogContent,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** Fields other than a channel's own composers keep their Shift+Esc. */
function isTypingOutsideChannel(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const editable =
		target.isContentEditable ||
		target.tagName === "INPUT" ||
		target.tagName === "TEXTAREA";
	return editable && !target.closest("[data-channel-screen]");
}

interface MarkAllReadShortcutProps {
	organizationId: string;
}

/** Shift+Esc on a channel screen, after a confirm: every channel and followed thread read. */
export function MarkAllReadShortcut({
	organizationId,
}: MarkAllReadShortcutProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const utils = cloudTrpc.useUtils();
	const markAllRead = cloudTrpc.channel.markAllRead.useMutation({
		onSuccess: () => {
			void utils.channel.invalidate();
			void utils.channelThread.invalidate();
		},
		onError: (error) =>
			toast.error(
				errorMessage(error, t({ message: "Couldn't save the change" })),
			),
	});

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.key !== "Escape" ||
				!event.shiftKey ||
				event.repeat ||
				event.defaultPrevented ||
				!window.location.hash.startsWith("#/channels") ||
				isTypingOutsideChannel(event.target) ||
				document.querySelector('[role="dialog"], [role="menu"]')
			) {
				return;
			}
			event.preventDefault();
			setOpen(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<AlertDialog open={open} onOpenChange={setOpen}>
			<EnterEnabledAlertDialogContent className="max-w-[360px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						<Trans>Mark everything as read?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>Every channel and thread you follow.</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => setOpen(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => markAllRead.mutate({ organizationId })}
					>
						<Trans>Mark all read</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
