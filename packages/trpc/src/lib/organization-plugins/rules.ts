import { getConnector } from "@superset/shared/connectors";
import { PLUGIN_CATALOG } from "@superset/shared/plugins";
import {
	PluginBundleError,
	unpackPluginBundle,
} from "@superset/shared/plugins/bundle";
import { pluginManifestSchema } from "@superset/shared/plugins/manifest-schema";
import {
	manifestIcon,
	PLUGIN_ICON_MAX_BYTES,
	pluginIconFile,
} from "@superset/shared/plugins/plugin-icon";
import {
	type PluginManifest,
	pluginConnector,
	supersetExtension,
} from "../../router/plugins/manifest";
import { connectorServer } from "../../router/plugins/proxy/resolve-target";
import { completeImageType, transformUrlFor } from "../upload";
import { isInternalHost } from "./internal-host";

export class OrganizationPluginError extends Error {}

/** Why an organization may not offer this manifest, or null when it may. A plugin with no tools, only skills and commands, is fine. */
export function organizationPluginProblem(
	manifest: PluginManifest,
): string | null {
	if (PLUGIN_CATALOG.some((plugin) => plugin.name === manifest.name)) {
		return `"${manifest.name}" is the name of a Paradev plugin`;
	}

	const slug = pluginConnector(manifest);
	if (slug) {
		const connector = getConnector(slug);
		if (!connector) return `"${slug}" is not a connector Paradev knows`;
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
		if (/^https:\/\/[^/?#]*\$\{/.test(url)) {
			return "its mcp url host cannot come from an input";
		}
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

/** Where a plugin's icon is served from, in the public bucket. */
export function organizationIconKey(
	organizationId: string,
	contentHash: string,
): string {
	return `organization-plugins/${organizationId}/${contentHash}/icon`;
}

export function organizationPluginIconUrl(
	organizationId: string,
	plugin: { manifest: unknown; contentHash: string },
): string | null {
	return pluginIconFile(manifestIcon(plugin.manifest))
		? transformUrlFor(organizationIconKey(organizationId, plugin.contentHash))
		: null;
}

/** The image file a manifest names as its icon, after the rules a publicly served icon must pass. */
export function organizationPluginIcon(
	manifest: PluginManifest,
	files: ReadonlyMap<string, Uint8Array>,
): { body: Buffer; contentType: string } | null {
	const file = pluginIconFile(manifestIcon(manifest));
	if (!file) return null;
	const bytes = files.get(file.relative);
	if (!bytes) {
		throw new OrganizationPluginError(
			`its icon ${file.relative} is not a file in the plugin`,
		);
	}
	if (bytes.length > PLUGIN_ICON_MAX_BYTES) {
		throw new OrganizationPluginError(
			`its icon is ${bytes.length} bytes, over the ${PLUGIN_ICON_MAX_BYTES} byte limit`,
		);
	}
	const body = Buffer.from(bytes);
	const contentType = completeImageType(body);
	if (!contentType) {
		throw new OrganizationPluginError(
			`its icon ${file.relative} must be a png, jpeg or webp image`,
		);
	}
	return { body, contentType };
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
