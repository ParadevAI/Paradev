import type { ReactNode } from "react";
import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspacesCacheOps } from "@/hooks/useHostWorkspaces";

export interface ArchivedCloudRowMenuProps {
	row: CloudWorkspaceRow;
	cache: HostWorkspacesCacheOps;
	onCopied: () => void;
	children: ReactNode;
}
