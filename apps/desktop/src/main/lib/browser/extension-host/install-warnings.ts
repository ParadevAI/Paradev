import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

interface InstallManifest {
	permissions?: string[];
	host_permissions?: string[];
	content_scripts?: { matches?: string[] }[];
}

const ALL_SITES = new Set([
	"<all_urls>",
	"*://*/*",
	"http://*/*",
	"https://*/*",
]);

// Chrome's wording, one line per group, in Chrome's order.
const PERMISSION_WARNINGS: [permissions: string[], line: MessageDescriptor][] =
	[
		[
			["tabs", "webNavigation", "history"],
			msg({ message: "Read your browsing history" }),
		],
		[
			["nativeMessaging"],
			msg({ message: "Communicate with cooperating native applications" }),
		],
		[["clipboardRead"], msg({ message: "Read data you copy and paste" })],
		[["privacy"], msg({ message: "Change your privacy-related settings" })],
		[
			["management"],
			msg({ message: "Manage your apps, extensions, and themes" }),
		],
		[["notifications"], msg({ message: "Display notifications" })],
	];

const WARNED_PERMISSIONS = new Set(
	PERMISSION_WARNINGS.flatMap(([permissions]) => permissions),
);

// Permissions Chrome installs without a warning line. Any other one gets the
// generic line, so an API missing from the table is never hidden.
const SILENT_PERMISSIONS = new Set([
	"activeTab",
	"alarms",
	"background",
	"clipboardWrite",
	"contextMenus",
	"cookies",
	"declarativeContent",
	"declarativeNetRequestWithHostAccess",
	"identity",
	"idle",
	"offscreen",
	"power",
	"scripting",
	"sidePanel",
	"storage",
	"unlimitedStorage",
	"webRequest",
	"webRequestAuthProvider",
	"webRequestBlocking",
]);

function access(manifest: InstallManifest) {
	const permissions = new Set(manifest.permissions ?? []);
	const hosts = new Set([
		...(manifest.host_permissions ?? []),
		...[...permissions].filter((permission) => permission.includes("://")),
		...(manifest.content_scripts ?? []).flatMap(
			(script) => script.matches ?? [],
		),
		...(permissions.has("<all_urls>") ? ["<all_urls>"] : []),
	]);
	return { permissions, hosts };
}

/** What the install question lists for an extension, as Chrome words it. */
export function installWarnings(
	manifest: InstallManifest,
	silentPermissions: ReadonlySet<string> = SILENT_PERMISSIONS,
): string[] {
	const { permissions, hosts } = access(manifest);
	const sites = new Set(
		[...hosts].map((pattern) =>
			pattern.replace(/^[^:]+:\/\//, "").replace(/\/.*$/, ""),
		),
	);

	const lines: string[] = [];
	if ([...hosts].some((pattern) => ALL_SITES.has(pattern))) {
		lines.push(
			i18n._(msg({ message: "Read and change all your data on all websites" })),
		);
	} else if (sites.size === 1) {
		const [site] = sites;
		lines.push(
			i18n._(msg({ message: `Read and change your data on ${site}` })),
		);
	} else if (sites.size > 1) {
		const count = sites.size;
		lines.push(
			i18n._(
				msg({ message: `Read and change your data on ${count} websites` }),
			),
		);
	}
	for (const [group, line] of PERMISSION_WARNINGS) {
		if (group.some((permission) => permissions.has(permission))) {
			lines.push(i18n._(line));
		}
	}
	const unwarned = [...permissions].filter(
		(permission) =>
			!permission.includes("://") &&
			permission !== "<all_urls>" &&
			!WARNED_PERMISSIONS.has(permission) &&
			!silentPermissions.has(permission),
	);
	if (unwarned.length > 0) {
		const features = unwarned.join(", ");
		lines.push(
			i18n._(msg({ message: `Use more browser features: ${features}` })),
		);
	}
	return lines;
}

function hostCovers(approved: string, host: string): boolean {
	if (approved === host || approved === "<all_urls>") return true;
	const [approvedScheme, approvedRest] = approved.split("://");
	if (approvedRest !== "*/*" || host === "<all_urls>") return false;
	const scheme = host.split("://")[0];
	return (
		approvedScheme === scheme ||
		(approvedScheme === "*" && (scheme === "http" || scheme === "https"))
	);
}

/** The install-question lines for access `manifest` has and `approved` did not. */
export function addedAccess(
	approved: InstallManifest,
	manifest: InstallManifest,
): string[] {
	const before = access(approved);
	const after = access(manifest);
	const hosts = [...after.hosts].filter(
		(host) => ![...before.hosts].some((covered) => hostCovers(covered, host)),
	);
	const permissions = [...after.permissions].filter(
		(permission) =>
			!permission.includes("://") &&
			permission !== "<all_urls>" &&
			!before.permissions.has(permission),
	);
	// Chrome asks again only for new warnings; any new API here asks, so nothing widens unseen.
	return installWarnings({ permissions, host_permissions: hosts }, new Set());
}
