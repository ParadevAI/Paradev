import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { app, BrowserWindow } from "electron";
import {
	type BeforeUpdate,
	downloadExtension,
	installChromeWebStore,
	setCrxVerifier,
	updateExtensions,
} from "electron-chrome-web-store";
import { confirm } from "./confirm-dialog";
import { verifyCrx3 } from "./crx3";
import { extensionIcon } from "./extension-icon";
import { saveSignedRecord } from "./extension-integrity";
import { accessDetail, addedAccess, installWarnings } from "./install-warnings";
import {
	loadUserExtensions,
	type TurnedOffExtension,
	type UserExtensionPaths,
} from "./load-user-extensions";

// The package's own updater checks the moment it starts. An update then
// deletes the old version's files while its service worker is still loading
// them (1Password died with "SyntaxError: Unexpected end of input").
const FIRST_UPDATE_CHECK_DELAY_MS = 5 * 60_000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 60_000;

export function browserExtensionsPath(): string {
	return path.join(app.getPath("userData"), "browser-extensions");
}

export function userExtensionPaths(): UserExtensionPaths {
	const userData = app.getPath("userData");
	return {
		extensionsPath: browserExtensionsPath(),
		manifestsPath: path.join(userData, "browser-extension-manifests"),
		turnedOffPath: path.join(userData, "browser-extensions-turned-off"),
	};
}

/** Installs and updates unpack only a verified CRX, and save its signed record for `loadUserExtensions`. */
export function enableCrxVerification(): void {
	setCrxVerifier((crx) => {
		const extensionId = verifyCrx3(crx);
		saveSignedRecord(crx, extensionId, userExtensionPaths().manifestsPath);
	});
}

type WebStoreOptions = NonNullable<Parameters<typeof installChromeWebStore>[0]>;
type OnUninstall = NonNullable<WebStoreOptions["onUninstall"]>;

export function confirmRemoval(
	name: string,
	window: Electron.BrowserWindow | undefined,
	signal?: AbortSignal,
	icon?: Electron.NativeImage,
): Promise<boolean> {
	return confirm(
		window,
		{
			icon,
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
		},
		signal,
	);
}

// The package installs on one click; Chrome asks first and lists what the extension can reach.
function confirmInstall(
	localizedName: string,
	manifest: chrome.runtime.Manifest,
	window: Electron.BrowserWindow | undefined,
	signal?: AbortSignal,
	icon?: Electron.NativeImage,
): Promise<boolean> {
	const warnings = installWarnings(manifest);
	return confirm(
		window,
		{
			icon,
			buttons: [
				i18n._(msg({ message: "Add extension" })),
				i18n._(msg({ message: "Cancel" })),
			],
			message: i18n._(msg({ message: `Add ${localizedName}?` })),
			detail: warnings.length
				? accessDetail(i18n._(msg({ message: "It can:" })), warnings)
				: undefined,
		},
		signal,
	);
}

// Chrome disables an update that reaches further until the user agrees; this keeps the old version instead.
function confirmUpdate(
	name: string,
	added: string[],
	window: Electron.BrowserWindow | undefined,
	icon?: Electron.NativeImage,
): Promise<boolean> {
	return confirm(window, {
		icon,
		buttons: [
			i18n._(msg({ message: "Update" })),
			i18n._(msg({ message: "Keep current version" })),
		],
		message: i18n._(msg({ message: `${name} wants more access` })),
		detail: accessDetail(
			i18n._(msg({ message: "The update can also:" })),
			added,
		),
	});
}

/**
 * Install, load and update Web Store extensions; installs and updates both pass
 * `verifyCrx3`. `onTurnedOff` gets the extensions not loaded because their
 * files changed, before the store itself is set up.
 */
export async function installBrowserWebStore(
	browserSession: Electron.Session,
	{
		removeExtension,
		onTurnedOff,
	}: {
		removeExtension: (extensionId: string) => Promise<void>;
		onTurnedOff: (extensions: TurnedOffExtension[]) => void;
	},
): Promise<void> {
	enableCrxVerification();
	// The manifest the user approved, from the store page. The download must not
	// reach further before it moves into the folder the app loads at start.
	const newInstalls = new Map<string, chrome.runtime.Manifest>();
	browserSession.extensions.on("extension-loaded", (_event, extension) => {
		newInstalls.delete(extension.id);
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
		const installed = browserSession.extensions.getExtension(details.id);
		const icon = installed
			? extensionIcon(installed.path, installed.manifest)
			: undefined;
		if (
			!(await confirmRemoval(
				details.localizedName,
				details.browserWindow,
				undefined,
				icon,
			))
		) {
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
		const current = browserSession.extensions.getExtension(id);
		const allowed = await confirmUpdate(
			name,
			added,
			BrowserWindow.getFocusedWindow() ?? undefined,
			current ? extensionIcon(current.path, current.manifest) : undefined,
		);
		if (!allowed) declinedUpdates.add(update);
		return allowed;
	};
	// Before the store API exists, so its install path cannot load a folder that is not yet checked.
	await app.whenReady();
	onTurnedOff(
		await loadUserExtensions(
			browserSession,
			userExtensionPaths(),
			localizedName,
		),
	);
	await installChromeWebStore({
		session: browserSession,
		extensionsPath: browserExtensionsPath(),
		loadExtensions: false,
		autoUpdate: false,
		verifyInstall,
		beforeInstall: async (details) => {
			const allowed = await confirmInstall(
				details.localizedName,
				details.manifest,
				details.browserWindow,
				undefined,
				details.icon,
			);
			if (allowed) newInstalls.set(details.id, details.manifest);
			return { action: allowed ? "allow" : "deny" };
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

async function localizedName(
	dir: string,
	manifest: chrome.runtime.Manifest,
): Promise<string> {
	const key = /^__MSG_(\w+)__$/.exec(manifest.name)?.[1]?.toLowerCase();
	if (!key || !manifest.default_locale) return manifest.name;
	try {
		const file = path.join(
			dir,
			"_locales",
			manifest.default_locale,
			"messages.json",
		);
		const messages: Record<string, { message?: string }> = JSON.parse(
			(await readFile(file, "utf8")).replace(/^\uFEFF/, ""),
		);
		const match = Object.entries(messages).find(
			([name]) => name.toLowerCase() === key,
		);
		return match?.[1].message || manifest.name;
	} catch {
		return manifest.name;
	}
}

/**
 * Install by Web Store ID, asking first with the warnings of the CRX that was
 * downloaded and verified. Resolves to null when the user says no, or when
 * `signal` aborts before they answer.
 */
export async function installWebStoreExtension(
	browserSession: Electron.Session,
	extensionId: string,
	window: Electron.BrowserWindow | undefined,
	signal?: AbortSignal,
): Promise<Electron.Extension | null> {
	const loaded = browserSession.extensions.getExtension(extensionId);
	if (loaded) return loaded;
	const extensionsPath = browserExtensionsPath();
	const stagedPath = await downloadExtension(
		extensionId,
		`${extensionsPath}.staging`,
	);
	try {
		const manifest: chrome.runtime.Manifest = JSON.parse(
			await readFile(path.join(stagedPath, "manifest.json"), "utf8"),
		);
		const name = await localizedName(stagedPath, manifest);
		const icon = extensionIcon(stagedPath, manifest);
		if (!(await confirmInstall(name, manifest, window, signal, icon))) {
			return null;
		}
		// The layout loadAllExtensions reads at start: <extensionsPath>/<id>/<version dir>.
		const installPath = path.join(
			extensionsPath,
			extensionId,
			path.basename(stagedPath),
		);
		await rm(installPath, { recursive: true, force: true });
		await mkdir(path.dirname(installPath), { recursive: true });
		await rename(stagedPath, installPath);
		return await browserSession.extensions.loadExtension(installPath);
	} finally {
		await rm(stagedPath, { recursive: true, force: true });
	}
}
