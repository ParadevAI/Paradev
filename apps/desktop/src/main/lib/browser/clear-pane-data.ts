export type PaneDataType = "cookies" | "cache" | "storage" | "all";

interface PaneSession {
	extensions: { getAllExtensions(): { id: string }[] };
	clearData(options?: Electron.ClearDataOptions): Promise<void>;
	clearCache(): Promise<void>;
	clearStorageData(options?: Electron.ClearStorageDataOptions): Promise<void>;
}

/**
 * Clears what a pane's sites stored. Installed extensions keep their own data,
 * as in Chrome: a password manager stays signed in after the user clears
 * browsing data.
 */
export async function clearPaneData(
	ses: PaneSession,
	type: PaneDataType,
): Promise<void> {
	const extensionOrigins = ses.extensions
		.getAllExtensions()
		.map((extension) => `chrome-extension://${extension.id}`);
	const keep = extensionOrigins.length
		? { excludeOrigins: extensionOrigins }
		: {};
	switch (type) {
		case "cookies":
			await ses.clearData({ dataTypes: ["cookies"], ...keep });
			break;
		case "cache":
			await ses.clearCache();
			break;
		case "storage":
			await ses.clearData({
				dataTypes: ["localStorage", "indexedDB"],
				...keep,
			});
			break;
		case "all":
			await ses.clearData(keep);
			await ses.clearCache();
			break;
	}
}
