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

import { LuTriangleAlert } from "react-icons/lu";

interface ImportThemeWarningDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onContinue: () => void;
}

export function ImportThemeWarningDialog({
	open,
	onOpenChange,
	onContinue,
}: ImportThemeWarningDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader className="gap-3">
					<AlertDialogTitle className="flex items-center gap-2">
						<LuTriangleAlert
							aria-hidden="true"
							className="size-5 shrink-0 text-amber-500"
						/>
						<Trans>Import custom theme?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription className="space-y-2 font-medium leading-relaxed text-foreground">
						<span className="block">
							<Trans>Untrusted themes may put your data at risk.</Trans>
						</span>
						<span className="block">
							<Trans>Only import themes from sources you trust.</Trans>
						</span>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<AlertDialogAction onClick={onContinue}>
						<Trans>Continue</Trans>
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
