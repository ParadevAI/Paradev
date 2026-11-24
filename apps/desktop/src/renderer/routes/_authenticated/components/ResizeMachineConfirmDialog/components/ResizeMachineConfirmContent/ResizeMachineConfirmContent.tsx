import { useLingui } from "@lingui/react/macro";
import type { MachineSize } from "@superset/shared/billing";
import {
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { useChangeMachineSize } from "renderer/routes/_authenticated/hooks/useChangeMachineSize";

export function ResizeMachineConfirmContent({
	workspaceId,
	size,
	onDone,
}: {
	workspaceId: string;
	size: MachineSize;
	onDone: () => void;
}) {
	const { t } = useLingui();
	const { workspaces } = useCloudWorkspaces();
	const { options, change } = useChangeMachineSize(workspaceId);
	const workspaceName = workspaces?.find((row) => row.id === workspaceId)?.name;
	const target = options.find((option) => option.size === size);
	const pendingName = target?.name ?? size;

	return (
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>
					{t({ message: "Change machine size" })}
				</AlertDialogTitle>
				<AlertDialogDescription asChild>
					<div className="space-y-2">
						<p>
							{workspaceName ? (
								<span className="font-medium text-foreground">
									{workspaceName}
								</span>
							) : null}
							{workspaceName ? " → " : null}
							<span className="font-medium text-foreground">
								{target ? `${target.name} · ${target.spec}` : size}
							</span>
						</p>
						<p>
							{t({
								message:
									"A running box restarts. Files and uncommitted changes are kept. The project's start services and agent sessions start again; anything else running in a terminal stops.",
							})}
						</p>
					</div>
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<Button variant="outline" onClick={onDone}>
					{t({ message: "Cancel" })}
				</Button>
				<Button
					variant="destructive"
					onClick={() => {
						onDone();
						void change(size);
					}}
				>
					{t({ message: `Change to ${pendingName}` })}
				</Button>
			</AlertDialogFooter>
		</AlertDialogContent>
	);
}
