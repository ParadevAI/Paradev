/**
 * Shared notification types used by both main and renderer processes.
 * Kept in shared/ to avoid cross-boundary imports.
 */

export type V2NotificationSource =
	| { type: "terminal"; id: string }
	| { type: "chat"; id: string };

export interface V2NotificationSourceFocusTarget {
	workspaceId: string;
	source: V2NotificationSource;
}
