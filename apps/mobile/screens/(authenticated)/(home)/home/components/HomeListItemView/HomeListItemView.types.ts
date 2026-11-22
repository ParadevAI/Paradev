import type {
	HostWorkspaceItem,
	HostWorkspacesCacheOps,
} from "@/hooks/useHostWorkspaces";
import type { OrgPullRequest } from "@/screens/(authenticated)/hooks/usePullRequests";
import type { CloudPullRequest } from "../../hooks/useCloudPullRequests";
import type {
	TerminalAttention,
	TerminalRowData,
} from "../../hooks/useHostTerminals";
import type { TagFolderActions } from "../../hooks/useTagFolderActions";
import type { DiffStats } from "../../hooks/useVisibleDiffStats";

export interface HomeListContext {
	cache: HostWorkspacesCacheOps;
	cloudCache: HostWorkspacesCacheOps;
	viewerId: string | null;
	diffStats: ReadonlyMap<string, DiffStats>;
	attentionByWorkspace: ReadonlyMap<string, TerminalAttention>;
	terminalsByWorkspace: ReadonlyMap<string, TerminalRowData[]>;
	hostPullRequest: (workspace: HostWorkspaceItem) => OrgPullRequest | undefined;
	cloudPullRequest: (workspaceId: string) => CloudPullRequest | undefined;
	folderActionsFor: (machineId: string) => TagFolderActions | null;
	onCopied: () => void;
	onRetryPresence: () => Promise<void>;
	onTogglePlace: (placeId: string) => void;
	onToggleSection: (placeId: string, key: string) => void;
	/** Opens the composer aimed at a project, or a machine's sessions when null. */
	onNewWorkspace: (projectId: string | null, machineId: string) => void;
}
