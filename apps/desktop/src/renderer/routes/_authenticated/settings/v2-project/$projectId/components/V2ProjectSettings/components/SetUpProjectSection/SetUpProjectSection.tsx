import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { SetupProjectModal } from "./components/SetupProjectModal";
import type { SetupOriginProject } from "./components/SetupProjectModal/utils/buildSetupInput";

interface SetUpProjectSectionProps {
	projectId: string;
	/** The project as a host that has it reports it. */
	project: SetupOriginProject;
	hostUrl: string | null;
	hostName: string;
	isRemoteTarget: boolean;
	onChanged?: () => void;
}

export function SetUpProjectSection({
	projectId,
	project,
	hostUrl,
	hostName,
	isRemoteTarget,
	onChanged,
}: SetUpProjectSectionProps) {
	const [open, setOpen] = useState(false);
	const canSetUp = Boolean(hostUrl) && project.repositories.length > 0;
	return (
		<div className="flex items-center gap-3">
			<span className="text-sm text-muted-foreground">
				<Trans>Not set up on {hostName}</Trans>
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={() => setOpen(true)}
				disabled={!canSetUp}
			>
				<Trans>Set up on {hostName}</Trans>
			</Button>
			{open && (
				<SetupProjectModal
					open={open}
					onOpenChange={setOpen}
					projectId={projectId}
					project={project}
					hostUrl={hostUrl}
					hostName={hostName}
					isRemoteTarget={isRemoteTarget}
					onChanged={onChanged}
				/>
			)}
		</div>
	);
}
