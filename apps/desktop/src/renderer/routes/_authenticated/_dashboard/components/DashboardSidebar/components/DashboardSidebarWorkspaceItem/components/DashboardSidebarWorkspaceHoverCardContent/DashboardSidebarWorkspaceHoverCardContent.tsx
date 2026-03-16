import { Button } from "@superset/ui/button";
import { LuExternalLink, LuGitBranch, LuGlobe } from "react-icons/lu";
import type { WorkspaceRowMockData } from "../../utils";
import { DashboardSidebarWorkspaceStatusBadge } from "../DashboardSidebarWorkspaceStatusBadge";

interface DashboardSidebarWorkspaceHoverCardContentProps {
	name: string;
	branch: string;
	mockData: WorkspaceRowMockData;
}

export function DashboardSidebarWorkspaceHoverCardContent({
	name,
	branch,
	mockData,
}: DashboardSidebarWorkspaceHoverCardContentProps) {
	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<div className="text-sm font-medium">{name || branch}</div>
				<div className="space-y-0.5">
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						Branch
					</span>
					<div className="flex items-center gap-1 break-all font-mono text-sm">
						{branch}
						<LuExternalLink className="size-3 shrink-0 text-muted-foreground" />
					</div>
				</div>
				<span className="block text-xs text-muted-foreground">
					Updated a few minutes ago
				</span>
			</div>

			<div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
				Mocked preview of the legacy workspace hover card.
			</div>

			{mockData.pr ? (
				<div className="space-y-2 border-t border-border pt-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<DashboardSidebarWorkspaceStatusBadge
								state={mockData.pr.state}
								prNumber={mockData.pr.number}
							/>
						</div>
						<div className="flex items-center gap-2 text-xs font-mono">
							<span className="text-emerald-500">
								+{mockData.diffStats.additions}
							</span>
							<span className="text-red-400">
								-{mockData.diffStats.deletions}
							</span>
						</div>
					</div>
					<p className="text-xs leading-relaxed">{mockData.pr.title}</p>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-7 flex-1 gap-1.5 text-xs"
						>
							<LuGitBranch className="size-3" />
							View branch
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 flex-1 gap-1.5 text-xs"
						>
							<LuGlobe className="size-3" />
							Open preview
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
