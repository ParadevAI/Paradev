import { getConnector } from "@superset/shared/connectors";
import { PLUGIN_CATALOG } from "@superset/shared/plugins";
import {
	PluginBundleError,
	unpackPluginBundle,
} from "@superset/shared/plugins/bundle";
import { pluginManifestSchema } from "@superset/shared/plugins/manifest-schema";
import {
	type PluginManifest,
	pluginConnector,
	supersetExtension,
} from "../../router/plugins/manifest";
import { connectorServer } from "../../router/plugins/proxy/resolve-target";

function isInternalHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host.endsWith(".local") || host.endsWith(".internal")) return true;
	if (host.includes(":")) {
		return (
			host === "::1" ||
			host === "::" ||
			/^f[cd]/.test(host) ||
			/^fe[89ab]/.test(host) ||
			host.startsWith("::ffff:")
		);
	}
	const octets = host.split(".").map(Number);
	if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) {
		return false;
	}
	const [a = 0, b = 0] = octets;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 100 && b >= 64 && b <= 127)
	);
}

export class OrganizationPluginError extends Error {}

/** Why an organization may not offer this manifest, or null when it may. A plugin with no tools, only skills and commands, is fine. */
export function organizationPluginProblem(
	manifest: PluginManifest,
): string | null {
	if (PLUGIN_CATALOG.some((plugin) => plugin.name === manifest.name)) {
		return `"${manifest.name}" is the name of a Superset plugin`;
	}

	const slug = pluginConnector(manifest);
	if (slug) {
		const connector = getConnector(slug);
		if (!connector) return `"${slug}" is not a connector Superset knows`;
		if (!connector.methods.some((method) => connectorServer(method))) {
			return `the ${slug} connector has no tool server of its own, so an organization plugin cannot use it`;
		}
		return null;
	}

	const url = supersetExtension(manifest)?.mcp?.url;
	if (url) {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return "its mcp url is not a valid url";
		}
		if (parsed.protocol !== "https:") return "its mcp url must be https";
		if (isInternalHost(parsed.hostname)) {
			return "its mcp url must not point at a private or internal address";
		}
	}
	return null;
}

export function organizationBundleKey(
	organizationId: string,
	contentHash: string,
): string {
	return `organization-plugins/${organizationId}/${contentHash}.json.gz`;
}

/** The manifest a bundle carries, after every rule an organization plugin must pass. */
export function readOrganizationBundle(bundle: Uint8Array): PluginManifest {
	let raw: unknown;
	try {
		raw = JSON.parse(
			unpackPluginBundle(bundle).files.get("plugin.json")?.toString("utf8") ??
				"",
		);
	} catch (error) {
		throw new OrganizationPluginError(
			error instanceof PluginBundleError
				? error.message
				: "its plugin.json is not valid JSON",
		);
	}
	const parsed = pluginManifestSchema.safeParse(raw);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		throw new OrganizationPluginError(
			issue
				? `plugin.json ${issue.path.join(".") || "root"}: ${issue.message}`
				: "plugin.json is not valid",
		);
	}
	const manifest = parsed.data as PluginManifest;
	const problem = organizationPluginProblem(manifest);
	if (problem) throw new OrganizationPluginError(problem);
	return manifest;
}
