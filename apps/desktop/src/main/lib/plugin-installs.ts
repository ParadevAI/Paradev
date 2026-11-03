import fs from "node:fs";
import path from "node:path";
import { msg } from "@lingui/core/macro";
import {
	createManagedSkills,
	ensureDefaultMarketplace,
	findInstalled,
	forgetOrganizationPlugins as forgetOrganizationPluginsOnMachine,
	installedPluginsFilePath,
	installOrganizationPlugin as installOrganizationPluginOnMachine,
	installPlugin as installPluginOnMachine,
	readInstalledPlugins,
	readInstalledVersions,
	reconcileOrganizationPlugins,
	removePlugin,
	resolveDisabledSkillIds,
	restorePluginTrees,
	serializePluginChange,
	setPluginEnabled as setPluginEnabledOnMachine,
	syncPluginMcpServers,
	syncPlugins as syncPluginsOnMachine,
	writeSharedDisabledSkillIds,
} from "@superset/agent-setup";
import { getBundledPluginDir } from "@superset/agent-setup/config";
import { i18n } from "@superset/i18n";
import { settings } from "@superset/local-db";
import {
	DEFAULT_MARKETPLACE,
	getPluginByName,
	isOrganizationMarketplace,
	organizationIdOfMarketplace,
	SUPERSET_MANAGED_SKILLS,
} from "@superset/shared/plugins";
import log from "electron-log/main";
import { loadToken } from "lib/trpc/routers/auth/utils/auth-functions";
import { adoptDesktopInstallList } from "main/lib/adopt-desktop-install-list";
import { createCloudApiClient } from "main/lib/cloud-api-client";
import { localDb } from "main/lib/local-db";
import { runPluginChange } from "main/lib/run-plugin-change";

/**
 * Plugin changes on this machine, made in-process through @superset/agent-setup.
 * installed_plugins.json is the only record of what is installed; the account
 * side is the renderer's (cloudTrpc.plugins.*).
 */

export interface PluginChangeResult {
	/** Set when the change landed but no agent config could take its tools. */
	mcpError: string | null;
}

const NO_CHANGE: PluginChangeResult = { mcpError: null };

export function syncInstalledPluginMcpServers(): void {
	const { error } = syncPluginMcpServers();
	if (error) log.warn("[plugins] plugin MCP servers were not synced:", error);
}

/** Moves the desktop's old local-db install list into installed_plugins.json, then installs their trees. */
export async function adoptDesktopInstalls(): Promise<void> {
	const list =
		localDb
			.select({ installedPlugins: settings.installedPlugins })
			.from(settings)
			.get()?.installedPlugins ?? [];
	await serializePluginChange(async () => {
		try {
			const moved = adoptDesktopInstallList(list);
			if (moved.length) {
				log.info(`[plugins] moved ${moved.join(", ")} to the ledger`);
				syncInstalledPluginMcpServers();
			}
		} catch (error) {
			log.warn("[plugins] could not move the old install list:", error);
		}
		const failed = await restorePluginTrees();
		if (failed.length)
			log.warn(`[plugins] could not install: ${failed.join("; ")}`);
	});
}

async function installDefaultPlugin(name: string): Promise<PluginChangeResult> {
	await ensureDefaultMarketplace();
	const { mcpError } = await installPluginOnMachine(name, DEFAULT_MARKETPLACE, {
		update: true,
	});
	return { mcpError };
}

/** Installs or updates; unknown plugin names return null. */
export async function installPlugin(
	name: string,
): Promise<PluginChangeResult | null> {
	if (!getPluginByName(name)) return null;
	return runPluginChange(() => installDefaultPlugin(name));
}

/** Removing a plugin this machine does not have is a no-op. */
export function uninstallPlugin(name: string): Promise<PluginChangeResult> {
	return runPluginChange(async () => {
		if (!findInstalled(readInstalledPlugins(), name, DEFAULT_MARKETPLACE)) {
			return NO_CHANGE;
		}
		const { mcpError } = await removePlugin(name, DEFAULT_MARKETPLACE);
		return { mcpError };
	});
}

/**
 * installed_plugins.json is the only `enabled` flag provisioning reads, so a
 * toggle rewrites it and re-syncs. Enabling a plugin this machine does not
 * have installs it; disabling one it does not have is a no-op.
 */
export function setPluginEnabled(
	name: string,
	enabled: boolean,
): Promise<PluginChangeResult> {
	return runPluginChange(async () => {
		if (findInstalled(readInstalledPlugins(), name, DEFAULT_MARKETPLACE)) {
			const { mcpError } = await setPluginEnabledOnMachine(
				name,
				enabled,
				DEFAULT_MARKETPLACE,
			);
			return { mcpError };
		}
		return enabled && getPluginByName(name)
			? installDefaultPlugin(name)
			: NO_CHANGE;
	});
}

async function signedInApi(organizationId?: string | null) {
	const { token } = await loadToken();
	if (!token) {
		throw new Error(
			i18n._(
				msg({ message: "Sign in to change your organization's plugins." }),
			),
		);
	}
	return createCloudApiClient(token, organizationId);
}

export function installOrganizationPlugin(
	name: string,
	marketplace: string,
): Promise<PluginChangeResult> {
	return runPluginChange(async () => {
		const api = await signedInApi(organizationIdOfMarketplace(marketplace));
		const { mcpError } = await installOrganizationPluginOnMachine(api, name);
		return { mcpError };
	});
}

/** The version of each organization plugin on this machine, which only the ledger knows. */
export function organizationPluginVersions(): {
	marketplace: string;
	name: string;
	version: string;
}[] {
	return (readInstalledVersions() ?? []).filter((entry) =>
		isOrganizationMarketplace(entry.marketplace),
	);
}

export function setOrganizationPluginEnabled(
	name: string,
	marketplace: string,
	enabled: boolean,
): Promise<PluginChangeResult> {
	return runPluginChange(async () => {
		if (!findInstalled(readInstalledPlugins(), name, marketplace)) {
			return NO_CHANGE;
		}
		const { mcpError } = await setPluginEnabledOnMachine(
			name,
			enabled,
			marketplace,
		);
		return { mcpError };
	});
}

const pendingForgetMarker = () =>
	path.join(
		path.dirname(installedPluginsFilePath()),
		".forget-organizations-pending",
	);

/** Removes every organization's plugins after a sign-out; a marker survives a quit so the next start finishes it. */
export async function forgetOrganizationPlugins(): Promise<void> {
	const marker = pendingForgetMarker();
	await fs.promises.mkdir(path.dirname(marker), { recursive: true });
	await fs.promises.writeFile(marker, "");
	await runPluginChange(async () => {
		forgetOrganizationPluginsOnMachine();
		await syncPluginsOnMachine();
	});
	await fs.promises.rm(marker, { force: true });
}

export function finishPendingOrganizationForget(): Promise<void> {
	return fs.existsSync(pendingForgetMarker())
		? forgetOrganizationPlugins()
		: Promise.resolve();
}

/**
 * Brings this machine's organization plugins in line with the account, then
 * re-provisions agents. Signed out, no organization's plugins stay.
 */
export function syncPlugins(organizationId?: string | null): Promise<void> {
	return runPluginChange(async () => {
		const { token } = await loadToken();
		if (!token) {
			forgetOrganizationPluginsOnMachine();
			await syncPluginsOnMachine();
			return;
		}
		const { failed } = await reconcileOrganizationPlugins(
			createCloudApiClient(token, organizationId),
			(id) => createCloudApiClient(token, id),
		);
		await syncPluginsOnMachine();
		if (failed.length) {
			const names = failed.join(", ");
			throw new Error(i18n._(msg({ message: `Could not download ${names}.` })));
		}
	});
}

/**
 * Allowlisted against the shipped skill set — the name never touches the
 * filesystem unless it's one of ours.
 */
function resolveBundledSkillPath(name: string): string | null {
	if (!SUPERSET_MANAGED_SKILLS.some((skill) => skill.name === name)) {
		return null;
	}
	return path.join(getBundledPluginDir(), "skills", name, "SKILL.md");
}

/**
 * Raw SKILL.md content (including frontmatter) of a bundled managed skill,
 * for the preview modal. Frontmatter must stay in — the in-app editor's
 * markdown view splits/reattaches it around edits, so a stripped read here
 * would delete it on the next save.
 */
export function getBundledSkillContent(name: string): string | null {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath) return null;
	try {
		return fs.readFileSync(skillPath, "utf-8");
	} catch {
		return null;
	}
}

/** Absolute path to a bundled skill's SKILL.md, for Open/Reveal in Finder. */
export function getBundledSkillPath(name: string): string | null {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath || !fs.existsSync(skillPath)) return null;
	return skillPath;
}

const SKILL_ICON_FILES = [
	{ file: "icon.svg", mime: "image/svg+xml" },
	{ file: "icon.png", mime: "image/png" },
] as const;

/**
 * Data URIs of per-skill icons distributed inside the skill folders
 * (`skills/<name>/icon.svg|png`) — the Superset convention for skill authors
 * to ship artwork with their skill, mirroring how Codex plugins carry
 * `interface` icons. Skills without one fall back to a default glyph in the
 * renderer.
 */
export function getBundledSkillIcons(): Record<string, string> {
	const icons: Record<string, string> = {};
	for (const skill of SUPERSET_MANAGED_SKILLS) {
		for (const { file, mime } of SKILL_ICON_FILES) {
			const iconPath = path.join(
				getBundledPluginDir(),
				"skills",
				skill.name,
				file,
			);
			try {
				const data = fs.readFileSync(iconPath);
				icons[skill.name] = `data:${mime};base64,${data.toString("base64")}`;
				break;
			} catch {
				// No icon in this format; try the next or fall through.
			}
		}
	}
	return icons;
}

export function getDisabledSkills(): string[] {
	return localDb.select().from(settings).get()?.disabledSkills ?? [];
}

// createManagedSkills does multi-await fs work, and so does every plugin
// change; one queue keeps a resync from finishing out of order with either.
function queueManagedSkillsSync(disabledSkills: readonly string[]): void {
	void serializePluginChange(() =>
		createManagedSkills({ disabledSkills }),
	).catch((error) => log.warn("[plugins] skill resync failed:", error));
}

/**
 * Overwrites a bundled skill's SKILL.md, then re-provisions it out to
 * ~/.agents/skills, the Claude plugin mirror, and the slash-command file —
 * same convention as setSkillEnabled below.
 */
export function writeBundledSkillContent(name: string, content: string): void {
	const skillPath = resolveBundledSkillPath(name);
	if (!skillPath) {
		throw new Error(`Unknown skill: ${name}`);
	}
	fs.writeFileSync(skillPath, content, "utf-8");
	queueManagedSkillsSync(resolveDisabledSkillIds(getDisabledSkills()));
}

/**
 * Toggling re-syncs immediately: disable reaps the skill from every agent
 * (and the Claude plugin mirror), enable rewrites it. Mirrored to the shared
 * disabled-skills file so CLI-launched host-services on this machine honor
 * the choice instead of re-provisioning a skill the user just disabled.
 * Returns null for a name outside SUPERSET_MANAGED_SKILLS.
 */
export function setSkillEnabled(
	name: string,
	enabled: boolean,
): string[] | null {
	if (!SUPERSET_MANAGED_SKILLS.some((skill) => skill.name === name)) {
		return null;
	}
	const current = new Set(getDisabledSkills());
	if (enabled) {
		current.delete(name);
	} else {
		current.add(name);
	}
	const next = [...current];
	localDb
		.insert(settings)
		.values({ id: 1, disabledSkills: next })
		.onConflictDoUpdate({
			target: settings.id,
			set: { disabledSkills: next },
		})
		.run();
	writeSharedDisabledSkillIds(next);
	// resolveDisabledSkillIds folds in SUPERSET_DISABLED_SKILLS — passing
	// `next` straight through would silently re-enable an env-disabled skill
	// on the next unrelated toggle.
	queueManagedSkillsSync(resolveDisabledSkillIds(next));
	return next;
}
