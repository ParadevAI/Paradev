import { Trans, useLingui } from "@lingui/react/macro";
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
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { ExtensionIcon } from "../ExtensionIcon";

interface RemoveExtensionDialogProps {
	/** Kept while the dialog closes, so its text does not blank mid-animation. */
	extension: BrowserExtension | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function RemoveExtensionDialog({
	extension,
	open,
	onOpenChange,
}: RemoveExtensionDialogProps) {
	const { t } = useLingui();
	const name = extension?.name ?? "";

	const handleRemove = () => {
		if (!extension) return;
		electronTrpcClient.browser.extensions.remove
			.mutate({ extensionId: extension.id })
			.catch(() => {
				toast.error(t({ message: `Could not remove ${name}` }));
			});
	};

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<EnterEnabledAlertDialogContent className="max-w-[340px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="flex items-center gap-2 font-medium">
						{extension && (
							<ExtensionIcon extension={extension} className="size-5" />
						)}
						<span className="min-w-0">
							<Trans>Remove {name}?</Trans>
						</span>
					</AlertDialogTitle>
					<AlertDialogDescription>
						<Trans>
							The extension and its local data are deleted from this browser.
						</Trans>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pt-2 pb-4">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={() => onOpenChange(false)}
					>
						<Trans>Cancel</Trans>
					</Button>
					<AlertDialogAction
						variant="destructive"
						size="sm"
						className="h-7 px-3 text-xs"
						onClick={handleRemove}
					>
						<Trans>Remove</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</EnterEnabledAlertDialogContent>
		</AlertDialog>
	);
}
