import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";

interface WorkspaceLinkChipProps {
	workspaceId: string;
	href: string;
	children: ReactNode;
}

/** A link to a workspace, shown as a row like the sidebar's; opens the workspace here. */
export function WorkspaceLinkChip({
	workspaceId,
	href,
	children,
}: WorkspaceLinkChipProps) {
	const navigate = useNavigate();
	const named = typeof children === "string" && children === href;
	return (
		<a
			href={href}
			onClick={(event) => {
				event.preventDefault();
				void navigateToV2Workspace(workspaceId, navigate);
			}}
			className="my-0.5 inline-flex h-7 max-w-full items-center gap-2 rounded-md border border-border bg-background/50 pr-2 pl-2 align-middle text-sm text-foreground no-underline transition-colors hover:bg-fill-hover"
		>
			<span className="flex size-4 shrink-0 items-center justify-center">
				<span className="size-1.5 rounded-full bg-muted-foreground/60" />
			</span>
			<span className="truncate font-medium">
				{named ? workspaceId.slice(0, 8) : children}
			</span>
			<ArrowUpRight
				className="size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		</a>
	);
}
