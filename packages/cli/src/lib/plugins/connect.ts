import { CLIError } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import { getApiUrl } from "../config";
import { findInstalled, type InstalledPlugin } from "./host";
import { type AuthInputSpec, missingInputsError } from "./inputs";

type AuthMethod = RouterOutputs["connectors"]["get"]["methods"][number];

export type PluginCommand = "install" | "connect";

interface CatalogEntry {
	name: string;
	marketplace: string;
	installed: boolean;
	connector: string | null;
}

/**
 * A connection belongs to the account, so a plugin installed there counts even
 * when this machine's ledger never recorded it. That is the state `plugins
 * list` reports.
 */
export function findConnectTarget<T extends CatalogEntry>(
	catalog: readonly T[],
	ledger: InstalledPlugin[],
	name: string,
	marketplace?: string,
): { marketplace: string; connector: string | null } | undefined {
	const local = findInstalled(ledger, name, marketplace);
	const matches = catalog.filter(
		(entry) =>
			entry.name === name &&
			(!marketplace || entry.marketplace === marketplace) &&
			(entry.installed || entry.marketplace === local?.marketplace),
	);
	if (matches.length > 1) {
		throw new CLIError(
			`"${name}" is installed from ${matches.map((entry) => entry.marketplace).join(", ")}.`,
			`Name one with --marketplace <name>, or ${name}@<marketplace>.`,
		);
	}
	const match = matches[0];
	if (match) {
		return { marketplace: match.marketplace, connector: match.connector };
	}
	return local
		? { marketplace: local.marketplace, connector: null }
		: undefined;
}

export function chooseAuthMethod({
	command,
	pluginName,
	slug,
	methods,
	requested,
}: {
	command: PluginCommand;
	pluginName: string;
	slug: string;
	methods: AuthMethod[];
	requested: string | undefined;
}): AuthMethod {
	const auth = requested
		? methods.find((entry) => entry.type === requested)
		: methods.length === 1
			? methods[0]
			: undefined;

	if (methods.length > 1 && !auth) {
		throw new CLIError(
			[
				`"${pluginName}" offers more than one way to connect. Ask the user which they prefer, then run:`,
				"",
				...methods.map(
					(entry) =>
						`  superset plugins ${command} ${pluginName} --method ${entry.type}${entry.label ? `   (${entry.label})` : ""}`,
				),
			].join("\n"),
		);
	}

	if (!auth) {
		throw new CLIError(`"${slug}" has no ${requested ?? "default"} method.`);
	}
	return auth;
}

export function authorizeUrl({
	command,
	pluginName,
	slug,
	auth,
	provided,
	organizationId,
}: {
	command: PluginCommand;
	pluginName: string;
	slug: string;
	auth: AuthMethod;
	provided: Record<string, string>;
	organizationId: string;
}): string {
	const declared = (auth.inputs ?? []) as AuthInputSpec[];

	const secrets = declared.filter((input) => input.secret);
	if (secrets.length) {
		throw new CLIError(
			`"${pluginName}" declares ${secrets
				.map((input) => `"${input.name}"`)
				.join(
					", ",
				)} as secret on its oauth2 method. A browser authorization URL cannot carry a secret; report this to the plugin's author.`,
		);
	}

	const missing = declared.filter(
		(input) => input.required && !provided[input.name],
	);
	if (missing.length)
		throw missingInputsError(pluginName, missing, declared, command);

	const params = new URLSearchParams({
		...Object.fromEntries(
			declared
				.filter((input) => !input.secret && input.name in provided)
				.map((input) => [input.name, provided[input.name] as string]),
		),
		method: auth.type,
	});
	params.set("organizationId", organizationId);
	return `${getApiUrl()}/api/connectors/${slug}/connect?${params}`;
}
