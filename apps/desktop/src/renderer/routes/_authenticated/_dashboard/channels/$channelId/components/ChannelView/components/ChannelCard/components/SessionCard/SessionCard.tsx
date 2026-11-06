import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { LuChevronRight, LuMessageSquare } from "react-icons/lu";
import { useAccessibleV2Workspaces } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { WHERE_FILTER_ANYWHERE } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/stores/v2WorkspacesFilterStore";
import { coordinatorAgentLabel } from "../../../../../ChannelPane/utils/coordinatorAgents";

interface SessionCardProps {
	workspaceId: string;
	/** The agent's label or preset id, as the CLI printed it. */
	agent: string | null;
	/** The first line of what the agent was told. */
	prompt: string | null;
	className?: string;
	onOpen: (workspaceId: string) => void;
}

/**
 * A chat the coordinator started in an agent's workspace, drawn where it
 * started it: which agent, in which workspace, and what it was told.
 */
export function SessionCard({
	workspaceId,
	agent,
	prompt,
	className,
	onOpen,
}: SessionCardProps) {
	const { all } = useAccessibleV2Workspaces({
		whereFilter: WHERE_FILTER_ANYWHERE,
	});
	const { t } = useLingui();
	const workspace = all.find((candidate) => candidate.id === workspaceId);
	const label = agent ? coordinatorAgentLabel(agent) : null;
	const name = workspace?.name ?? t({ message: "a workspace" });
	return (
		<button
			type="button"
			onClick={() => onOpen(workspaceId)}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-[10px] border border-border bg-background py-2 pr-2 pl-2.5 text-left transition-colors hover:bg-fill-hover",
				className,
			)}
		>
			<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-fill-hover text-muted-foreground">
				<LuMessageSquare className="size-3.5" />
			</span>
			<span className="flex min-w-0 flex-1 flex-col gap-px">
				<span className="truncate text-[13px] leading-[18px]">
					{label ? (
						<Trans>
							{label} started in <strong>{name}</strong>
						</Trans>
					) : (
						<Trans>
							Chat started in <strong>{name}</strong>
						</Trans>
					)}
				</span>
				{prompt && (
					<span className="truncate text-[11px] leading-[14px] text-muted-foreground">
						“{prompt}”
					</span>
				)}
			</span>
			<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
		</button>
	);
}
