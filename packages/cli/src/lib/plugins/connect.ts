import { CLIError } from "@superset/cli-framework";
import type { RouterOutputs } from "@superset/trpc";
import { getApiUrl } from "../config";
import { type AuthInputSpec, missingInputsError } from "./inputs";

type AuthMethod = RouterOutputs["connectors"]["get"]["methods"][number];

export type PluginCommand = "install" | "connect";

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
