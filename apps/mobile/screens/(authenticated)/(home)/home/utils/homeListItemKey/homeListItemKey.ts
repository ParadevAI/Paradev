import type { HomeListItem } from "../../types";

export function homeListItemKey(item: HomeListItem): string {
	switch (item.kind) {
		case "placeLabel":
			return `host:${item.placeId}`;
		case "placeEmpty":
			return `empty:${item.placeId}`;
		case "projectHeader":
			return `project:${item.machineId}:${item.projectId}`;
		case "folderHeader":
			return `folder:${item.machineId}:${item.folder.key}`;
		case "workspace":
			return `ws:${item.workspace.id}`;
		case "sectionLabel":
			return `label:${item.key}`;
		case "cloudRow":
			return `cloud:${item.row.id}`;
		default:
			return "host-offline";
	}
}
