export const INSTALLED_CHANNEL = "browser-extension-installed";

export interface InstalledDetails {
	reason: "install" | "update" | "chrome_update";
	previousVersion?: string;
}
