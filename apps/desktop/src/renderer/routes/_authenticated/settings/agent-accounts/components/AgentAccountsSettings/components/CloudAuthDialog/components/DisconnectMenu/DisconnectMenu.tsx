import { Trans, useLingui } from "@lingui/react/macro";
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
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { EllipsisVertical } from "lucide-react";
import { useState } from "react";

export interface DisconnectCopy {
	action: string;
	title: string;
	description: string;
	done: string;
	doneDetail?: string;
}

export function DisconnectMenu({
	agentLabel,
	credential,
	disconnect,
	onReconnect,
	copy: copyOverride,
}: {
	agentLabel: string;
	credential: string;
	disconnect: () => Promise<unknown>;
	onReconnect?: () => void;
	copy?: DisconnectCopy;
}) {
	const { t } = useLingui();
	const copy = copyOverride ?? {
		action: t({ message: "Disconnect" }),
		title: t({ message: `Disconnect ${credential}?` }),
		description: t({
			message: `Cloud workspaces will stop running ${agentLabel} with it.`,
		}),
		done: t({ message: `Removed ${credential} for ${agentLabel}.` }),
		doneDetail: t({
			message: "Restart workspaces to pick up new agent credentials.",
		}),
	};
	const [confirming, setConfirming] = useState(false);
	const handleDisconnect = async () => {
		try {
			await disconnect();
			toast.success(copy.done, { description: copy.doneDetail });
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({ message: "Could not disconnect." }),
			);
		}
	};
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						aria-label={t({ message: "More options" })}
						className="size-7"
						size="icon"
						variant="ghost"
					>
						<EllipsisVertical className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{onReconnect ? (
						<DropdownMenuItem onSelect={onReconnect}>
							<Trans>Reconnect</Trans>
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						onSelect={() => setConfirming(true)}
						variant="destructive"
					>
						{copy.action}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog onOpenChange={setConfirming} open={confirming}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{copy.title}</AlertDialogTitle>
						<AlertDialogDescription>{copy.description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Trans>Cancel</Trans>
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => void handleDisconnect()}
							variant="destructive"
						>
							{copy.action}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
