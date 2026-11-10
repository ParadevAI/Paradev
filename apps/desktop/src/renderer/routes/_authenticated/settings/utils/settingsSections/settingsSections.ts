import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ElementType } from "react";
import {
	HiOutlineAdjustmentsHorizontal,
	HiOutlineBeaker,
	HiOutlineBell,
	HiOutlineBuildingOffice2,
	HiOutlineChartBar,
	HiOutlineCommandLine,
	HiOutlineComputerDesktop,
	HiOutlineCpuChip,
	HiOutlineCreditCard,
	HiOutlineCube,
	HiOutlineDevicePhoneMobile,
	HiOutlineDocumentText,
	HiOutlineFolder,
	HiOutlineGlobeAlt,
	HiOutlineKey,
	HiOutlineLockClosed,
	HiOutlinePaintBrush,
	HiOutlinePuzzlePiece,
	HiOutlineShieldCheck,
	HiOutlineSquares2X2,
	HiOutlineUser,
	HiOutlineUserGroup,
} from "react-icons/hi2";
import { LuGitBranch, LuKeyboard, LuKeyRound, LuLink } from "react-icons/lu";
import type { SettingsSection } from "renderer/stores/settings-state";

export type SettingsRoute =
	| "/settings/mobile"
	| "/settings/account"
	| "/settings/connections"
	| "/settings/organization"
	| "/settings/teams"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/usage"
	| "/settings/keyboard"
	| "/settings/behavior"
	| "/settings/browser"
	| "/settings/git"
	| "/settings/agents"
	| "/settings/terminal"
	| "/settings/files"
	| "/settings/agent-accounts"
	| "/settings/experimental"
	| "/settings/integrations"
	| "/settings/plugins"
	| "/settings/billing"
	| "/settings/api-keys"
	| "/settings/security"
	| "/settings/permissions"
	| "/settings/projects"
	| "/settings/hosts"
	| "/settings/environments";

export interface SettingsSectionItem {
	id: SettingsRoute;
	section: SettingsSection;
	label: MessageDescriptor;
	icon: ElementType<{ className?: string }>;
	/** Extra search terms for the command palette's Settings list. */
	keywords?: string[];
	macOnly?: boolean;
	adminOnly?: boolean;
	/** Content wants the full pane width instead of the default centered max-w-4xl column. */
	fullWidth?: boolean;
}

export interface SettingsSectionGroup {
	label: MessageDescriptor;
	items: SettingsSectionItem[];
}

/** Every settings page, in sidebar order. The settings sidebar and the command palette both list these. */
export const SETTINGS_SECTION_GROUPS: SettingsSectionGroup[] = [
	{
		label: msg({
			message: "Personal",
		}),
		items: [
			{
				id: "/settings/account",
				section: "account",
				label: msg({
					message: "Account",
				}),
				icon: HiOutlineUser,
			},
			{
				id: "/settings/connections",
				section: "connections",
				label: msg({
					message: "Connections",
				}),
				icon: LuLink,
			},
			{
				id: "/settings/appearance",
				section: "appearance",
				label: msg({
					message: "Appearance",
				}),
				icon: HiOutlinePaintBrush,
				keywords: ["theme", "color"],
			},
			{
				id: "/settings/ringtones",
				section: "ringtones",
				label: msg({
					message: "Notifications",
				}),
				icon: HiOutlineBell,
				keywords: ["ringtones", "sounds"],
			},
			{
				id: "/settings/usage",
				section: "usage",
				label: msg({
					message: "Usage",
				}),
				icon: HiOutlineChartBar,
				keywords: ["tokens", "cost", "quota", "cpu", "memory", "resources"],
				fullWidth: true,
			},
			{
				id: "/settings/mobile",
				section: "mobile",
				label: msg({ message: "Mobile" }),
				icon: HiOutlineDevicePhoneMobile,
			},
		],
	},
	{
		label: msg({
			message: "Editor & Workflow",
		}),
		items: [
			{
				id: "/settings/behavior",
				section: "behavior",
				label: msg({
					message: "General",
				}),
				icon: HiOutlineAdjustmentsHorizontal,
				keywords: ["behavior"],
			},
			{
				id: "/settings/keyboard",
				section: "keyboard",
				label: msg({
					message: "Keyboard",
				}),
				icon: LuKeyboard,
				keywords: ["hotkeys", "shortcuts"],
			},
			{
				id: "/settings/git",
				section: "git",
				label: msg({
					message: "Git & Worktrees",
				}),
				icon: LuGitBranch,
			},
			{
				id: "/settings/agents",
				section: "agents",
				label: msg({
					message: "Agent commands",
				}),
				icon: HiOutlineCpuChip,
				fullWidth: true,
			},
			{
				id: "/settings/terminal",
				section: "terminal",
				label: msg({
					message: "Terminal",
				}),
				icon: HiOutlineCommandLine,
				keywords: ["terminal scripts", "scripts", "presets", "commands"],
			},
			{
				id: "/settings/files",
				section: "files",
				label: msg({
					message: "Files & Editor",
				}),
				icon: HiOutlineDocumentText,
				keywords: ["links", "files", "folders", "editor", "auto save"],
			},
			{
				id: "/settings/browser",
				section: "browser",
				label: msg({
					message: "Browser",
				}),
				icon: HiOutlineGlobeAlt,
			},
		],
	},
	{
		label: msg({
			message: "Cloud",
		}),
		items: [
			{
				id: "/settings/environments",
				section: "environments",
				label: msg({
					message: "Environments",
				}),
				icon: HiOutlineCube,
			},
			{
				id: "/settings/agent-accounts",
				section: "agentAccounts",
				label: msg({
					message: "Agents",
				}),
				icon: LuKeyRound,
			},
		],
	},
	{
		label: msg({
			message: "Organization",
		}),
		items: [
			{
				id: "/settings/organization",
				section: "organization",
				label: msg({
					message: "Organization",
				}),
				icon: HiOutlineBuildingOffice2,
			},
			{
				id: "/settings/teams",
				section: "teams",
				label: msg({
					message: "Teams",
				}),
				icon: HiOutlineUserGroup,
			},
			{
				id: "/settings/projects",
				section: "project",
				label: msg({
					message: "Projects",
				}),
				icon: HiOutlineFolder,
				fullWidth: true,
			},
			{
				id: "/settings/hosts",
				section: "hosts",
				label: msg({
					message: "Hosts",
				}),
				icon: HiOutlineComputerDesktop,
				fullWidth: true,
			},
			{
				id: "/settings/integrations",
				section: "integrations",
				label: msg({
					message: "Integrations",
				}),
				icon: HiOutlinePuzzlePiece,
			},
			{
				id: "/settings/plugins",
				section: "plugins",
				label: msg({
					message: "Plugins",
				}),
				icon: HiOutlineSquares2X2,
				adminOnly: true,
			},
			{
				id: "/settings/billing",
				section: "billing",
				label: msg({
					message: "Billing",
				}),
				icon: HiOutlineCreditCard,
			},
			{
				id: "/settings/api-keys",
				section: "apikeys",
				label: msg({
					message: "API Keys",
				}),
				icon: HiOutlineKey,
				keywords: ["token"],
			},
		],
	},
	{
		label: msg({
			message: "System",
		}),
		items: [
			{
				id: "/settings/security",
				section: "security",
				label: msg({
					message: "Remote Access",
				}),
				icon: HiOutlineLockClosed,
				keywords: ["security", "relay"],
			},
			{
				id: "/settings/permissions",
				section: "permissions",
				label: msg({
					message: "Permissions",
				}),
				icon: HiOutlineShieldCheck,
				macOnly: true,
			},
			{
				id: "/settings/experimental",
				section: "experimental",
				label: msg({
					message: "Experimental",
				}),
				icon: HiOutlineBeaker,
			},
		],
	},
];

/**
 * Settings sections whose content wants the full pane width instead of the
 * default centered max-w-4xl column — read by the Settings layout so a new
 * full-width section only needs to be marked here, not also in a second,
 * disconnected path list.
 */
export const FULL_WIDTH_SECTION_PATHS: readonly string[] =
	SETTINGS_SECTION_GROUPS.flatMap((group) =>
		group.items.filter((item) => item.fullWidth).map((item) => item.id),
	);

export interface SettingsSectionVisibility {
	isMac: boolean;
	isAdmin: boolean;
	mobileEnabled: boolean;
	pluginsEnabled: boolean;
	allowedSections: ReadonlySet<SettingsSection>;
}

export function isSettingsSectionVisible(
	item: SettingsSectionItem,
	visibility: SettingsSectionVisibility,
): boolean {
	return (
		(!item.macOnly || visibility.isMac) &&
		(item.section !== "mobile" || visibility.mobileEnabled) &&
		(item.section !== "plugins" || visibility.pluginsEnabled) &&
		(!item.adminOnly || visibility.isAdmin) &&
		visibility.allowedSections.has(item.section)
	);
}
