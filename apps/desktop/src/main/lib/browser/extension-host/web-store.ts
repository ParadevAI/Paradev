import path from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, dialog } from "electron";
import {
	installChromeWebStore,
	setCrxVerifier,
	updateExtensions,
} from "electron-chrome-web-store";
import { verifyCrx3 } from "./crx3";

// The package's own updater checks the moment it starts. An update then
// deletes the old version's files while its service worker is still loading
// them (1Password died with "SyntaxError: Unexpected end of input").
const FIRST_UPDATE_CHECK_DELAY_MS = 5 * 60_000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 60_000;

export function browserExtensionsPath(): string {
	return path.join(app.getPath("userData"), "browser-extensions");
}

export function enableCrxVerification(): void {
	setCrxVerifier((crx) => {
		verifyCrx3(crx);
	});
}

type OnUninstall = NonNullable<
	NonNullable<Parameters<typeof installChromeWebStore>[0]>["onUninstall"]
>;

async function confirmRemoval(
	name: string,
	window: Electron.BrowserWindow | undefined,
): Promise<boolean> {
	const options: Electron.MessageBoxOptions = {
		type: "question",
		buttons: [
			i18n._(msg({ message: "Remove" })),
			i18n._(msg({ message: "Cancel" })),
		],
		defaultId: 1,
		cancelId: 1,
		message: i18n._(msg({ message: `Remove ${name}?` })),
		detail: i18n._(
			msg({
				message:
					"The extension and its local data are deleted from this browser.",
			}),
		),
	};
	const { response } = window
		? await dialog.showMessageBox(window, options)
		: await dialog.showMessageBox(options);
	return response === 0;
}

/** Install, load and update Web Store extensions; installs and updates both pass `verifyCrx3`. */
export async function installBrowserWebStore(
	browserSession: Electron.Session,
	{
		removeExtension,
		pinExtension,
	}: {
		removeExtension: (extensionId: string) => Promise<void>;
		pinExtension: (extensionId: string) => void;
	},
): Promise<void> {
	enableCrxVerification();
	// Pinned once its first load succeeds; updates and restarts load it again.
	const newInstalls = new Set<string>();
	browserSession.extensions.on("extension-loaded", (_event, extension) => {
		if (newInstalls.delete(extension.id)) pinExtension(extension.id);
	});
	const onUninstall: OnUninstall = async (details) => {
		if (
			details.showConfirmDialog &&
			!(await confirmRemoval(details.localizedName, details.browserWindow))
		) {
			return false;
		}
		await removeExtension(details.id);
		return true;
	};
	await installChromeWebStore({
		session: browserSession,
		extensionsPath: browserExtensionsPath(),
		autoUpdate: false,
		beforeInstall: async ({ id }) => {
			newInstalls.add(id);
			return { action: "allow" };
		},
		onUninstall,
	});
	const checkForUpdates = () => {
		void updateExtensions(browserSession).catch((error: unknown) => {
			console.error("[extension-host] Extension update failed:", error);
		});
	};
	setTimeout(() => {
		checkForUpdates();
		setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
	}, FIRST_UPDATE_CHECK_DELAY_MS);
}
