import { Trans } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { Play, Settings, Square } from "lucide-react";
import { useSetSettingsSearchQuery } from "renderer/stores/settings-state";
import type { RepositoryRun } from "../../hooks/useV2WorkspaceRun";

interface RepositoryRunItemsProps {
	repositoryRuns: RepositoryRun[];
	onRunAll: () => void | Promise<void>;
	onStopAll: () => void | Promise<void>;
	onStart: (repositoryId: string) => void | Promise<void>;
	onStop: (repositoryId: string) => void | Promise<void>;
}

/** "Run all", then one Run or Stop row per repository of a multi-repo workspace. */
export function RepositoryRunItems({
	repositoryRuns,
	onRunAll,
	onStopAll,
	onStart,
	onStop,
}: RepositoryRunItemsProps) {
	const navigate = useNavigate();
	const setSettingsSearchQuery = useSetSettingsSearchQuery();
	const runnable = repositoryRuns.filter(
		(run) => (run.commands ?? []).length > 0,
	);
	const canRunMore = runnable.some((run) => !run.runningState);
	const isAnyRunning = repositoryRuns.some((run) => run.runningState);

	const configure = (projectId: string) => {
		setSettingsSearchQuery("scripts");
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId },
		});
	};

	return (
		<>
			<DropdownMenuItem disabled={!canRunMore} onClick={() => void onRunAll()}>
				<Play className="size-4" />
				<Trans>Run all</Trans>
			</DropdownMenuItem>
			{isAnyRunning && (
				<DropdownMenuItem onClick={() => void onStopAll()}>
					<Square className="size-4" />
					<Trans>Stop all</Trans>
				</DropdownMenuItem>
			)}
			<DropdownMenuSeparator />
			{repositoryRuns.map((run) => {
				const hasScript = (run.commands ?? []).length > 0;
				const isRunning = Boolean(run.runningState);
				const projectId = run.projectId;
				return (
					<DropdownMenuItem
						key={run.id}
						disabled={!hasScript && !projectId}
						onClick={() => {
							if (isRunning) void onStop(run.id);
							else if (hasScript) void onStart(run.id);
							else if (projectId) configure(projectId);
						}}
						className={cn(!hasScript && "text-muted-foreground")}
					>
						{isRunning ? (
							<Square className="size-4 text-emerald-400" />
						) : hasScript ? (
							<Play className="size-4" />
						) : (
							<Settings className="size-4" />
						)}
						<span className="min-w-0 truncate">{run.name}</span>
						<DropdownMenuShortcut className="tracking-normal">
							{isRunning ? (
								<Trans>Stop</Trans>
							) : hasScript ? (
								<Trans>Run</Trans>
							) : (
								<Trans>Set run script</Trans>
							)}
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				);
			})}
		</>
	);
}
