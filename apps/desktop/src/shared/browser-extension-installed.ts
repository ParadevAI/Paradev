export const INSTALLED_CHANNEL = "browser-extension-installed";

export interface InstalledDetails {
	reason: "install" | "update" | "chrome_update";
	previousVersion?: string;
}

/** The event a worker still has to get, for the version it was computed for. */
export interface PendingInstalled {
	details: InstalledDetails;
	version: string;
}

export type InstalledRequest =
	| [method: "pending"]
	| [method: "delivered", version: string];
