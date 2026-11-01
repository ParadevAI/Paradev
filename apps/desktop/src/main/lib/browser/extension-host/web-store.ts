import path from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, BrowserWindow } from "electron";
import {
	type BeforeUpdate,
	installChromeWebStore,
	setCrxVerifier,
	updateExtensions,
} from "electron-chrome-web-store";
import { confirm } from "./confirm-dialog";
import { verifyCrx3 } from "./crx3";
import { addedAccess, installWarnings } from "./install-warnings";

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

type WebStoreOptions = NonNullable<Parameters<typeof installChromeWebStore>[0]>;
type OnUninstall = NonNullable<WebStoreOptions["onUninstall"]>;
type BeforeInstall = NonNullable<WebStoreOptions["beforeInstall"]>;

function confirmRemoval(
	name: string,
	window: Electron.BrowserWindow | undefined,
): Promise<boolean> {
	return confirm(window, {
		buttons: [
			i18n._(msg({ message: "Remove" })),
			i18n._(msg({ message: "Cancel" })),
		],
		message: i18n._(msg({ message: `Remove ${name}?` })),
		detail: i18n._(
			msg({
				message:
					"The extension and its local data are deleted from this browser.",
			}),
		),
	});
}

// The package installs on one click; Chrome asks first and lists what the extension can reach.
const confirmInstall: BeforeInstall = async ({
	localizedName,
	manifest,
	browserWindow,
}) => {
	const warnings = installWarnings(manifest);
	const allowed = await confirm(browserWindow, {
		buttons: [
			i18n._(msg({ message: "Add extension" })),
			i18n._(msg({ message: "Cancel" })),
		],
		message: i18n._(msg({ message: `Add ${localizedName}?` })),
		detail: warnings.length
			? [i18n._(msg({ message: "It can:" })), ...warnings].join("\n")
			: undefined,
	});
	return { action: allowed ? "allow" : "deny" };
};

// Chrome disables an update that reaches further until the user agrees; this keeps the old version instead.
function confirmUpdate(
	name: string,
	added: string[],
	window: Electron.BrowserWindow | undefined,
): Promise<boolean> {
	return confirm(window, {
		buttons: [
			i18n._(msg({ message: "Update" })),
			i18n._(msg({ message: "Keep current version" })),
		],
		message: i18n._(msg({ message: `${name} wants more access` })),
		detail: [i18n._(msg({ message: "The update can also:" })), ...added].join(
			"\n",
		),
	});
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
	// The manifest the user approved, from the store page. The download must not
	// reach further before it moves into the folder the app loads at start.
	const newInstalls = new Map<string, chrome.runtime.Manifest>();
	browserSession.extensions.on("extension-loaded", (_event, extension) => {
		if (newInstalls.delete(extension.id)) pinExtension(extension.id);
	});
	const verifyInstall = async ({
		id,
		manifest,
	}: {
		id: string;
		manifest: chrome.runtime.Manifest;
	}) => {
		const approved = newInstalls.get(id);
		if (approved && addedAccess(approved, manifest).length === 0) return true;
		newInstalls.delete(id);
		console.error(
			`[extension-host] ${id} asks for more than its install question showed; not installed`,
		);
		return false;
	};
	// The page decides showConfirmDialog; removal deletes a vault's data, so always ask.
	const onUninstall: OnUninstall = async (details) => {
		if (!(await confirmRemoval(details.localizedName, details.browserWindow))) {
			return false;
		}
		await removeExtension(details.id);
		return true;
	};
	const declinedUpdates = new Set<string>();
	const beforeUpdate: BeforeUpdate = async ({
		id,
		name,
		oldManifest,
		manifest,
	}) => {
		const added = addedAccess(oldManifest, manifest);
		if (added.length === 0) return true;
		const update = `${id}@${manifest.version}`;
		if (declinedUpdates.has(update)) return false;
		const allowed = await confirmUpdate(
			name,
			added,
			BrowserWindow.getFocusedWindow() ?? undefined,
		);
		if (!allowed) declinedUpdates.add(update);
		return allowed;
	};
	await installChromeWebStore({
		session: browserSession,
		extensionsPath: browserExtensionsPath(),
		autoUpdate: false,
		verifyInstall,
		beforeInstall: async (details) => {
			const decision = await confirmInstall(details);
			if (decision.action === "allow") {
				newInstalls.set(details.id, details.manifest);
			}
			return decision;
		},
		onUninstall,
	});
	const checkForUpdates = () => {
		void updateExtensions(browserSession, { beforeUpdate }).catch(
			(error: unknown) => {
				console.error("[extension-host] Extension update failed:", error);
			},
		);
	};
	setTimeout(() => {
		checkForUpdates();
		setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
	}, FIRST_UPDATE_CHECK_DELAY_MS);
}
