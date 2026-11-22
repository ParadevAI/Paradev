import type { CloudWorkspaceRow } from "@/hooks/useCloudWorkspaces";
import type { HostWorkspaceItem } from "@/hooks/useHostWorkspaces";
import type { PlaceStatus } from "@/screens/(authenticated)/(home)/utils/placeStatus";
import type { TerminalAttention } from "./hooks/useHostTerminals/attention";
import type { TagFolderGroup } from "./utils/groupByTagFolder";

/** A project's groups, for the group menus of its rows and headers. */
export interface ProjectGroups {
	machineId: string;
	projectId: string | null;
	folders: TagFolderGroup<HostWorkspaceItem>[];
	folderTags: string[];
	/** Every workspace in the scope, hidden ones included, for Delete group. */
	workspaces: HostWorkspaceItem[];
}

export type HomeListItem =
	| {
			kind: "hostLabel";
			/** A machine id, or "cloud". */
			placeId: string;
			name: string;
			cloud: boolean;
			status: PlaceStatus;
			lastSeenAt?: number | null;
			/** Offers Try again, for the single-host offline notice. */
			retry?: boolean;
			/** The list's first item. */
			first?: boolean;
			/** Under several places the header folds its place away. */
			collapsible?: boolean;
			collapsed?: boolean;
			/** Workspaces listed under the place. */
			count?: number;
			/** The most urgent state among rows a collapsed place hides. */
			attention?: TerminalAttention | null;
	  }
	| {
			kind: "placeEmpty";
			placeId: string;
			/** Null while the place has not answered yet. */
			label: string | null;
	  }
	| {
			kind: "projectHeader";
			machineId: string;
			projectId: string;
			name: string;
			iconUrl?: string | null;
			count: number;
			collapsed: boolean;
			attention: TerminalAttention | null;
			offline: boolean;
	  }
	| {
			kind: "folderHeader";
			machineId: string;
			folder: TagFolderGroup<HostWorkspaceItem>;
			collapsed: boolean;
			attention: TerminalAttention | null;
			groups: ProjectGroups;
			offline: boolean;
	  }
	| {
			kind: "workspace";
			workspace: HostWorkspaceItem;
			groups?: ProjectGroups;
			folderTag?: string | null;
			/** Set for a row inside a group: its colour, and if it ends the group. */
			group?: { color: string | null; last: boolean };
			offline?: boolean;
			/** Replaces the branch line, e.g. "project · host" under Needs me. */
			detail?: string;
	  }
	| {
			kind: "hostOffline";
			hostName: string;
			lastSeenAt: number | null | undefined;
	  }
	| {
			kind: "periodHeader";
			key: string;
			label: string;
	  }
	| { kind: "cloudRow"; row: CloudWorkspaceRow; detail?: string };

export function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "hostLabel":
			return `host:${item.placeId}`;
		case "placeEmpty":
			return `empty:${item.placeId}`;
		case "projectHeader":
			return `project:${item.machineId}:${item.projectId}`;
		case "folderHeader":
			return `folder:${item.machineId}:${item.folder.key}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "periodHeader":
			return `period:${item.key}`;
		case "cloudRow":
			return `cloud:${item.row.id}`;
		default:
			return "host-offline";
	}
}
