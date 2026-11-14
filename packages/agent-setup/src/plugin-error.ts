export type PluginErrorCode =
	| "not-found"
	| "ambiguous"
	| "already-installed"
	| "not-installed"
	| "marketplace-not-installed";

/**
 * A plugin change that could not be made. `code` lets a caller add its own
 * next step (the CLI names a command, the desktop does not).
 */
export class PluginError extends Error {
	readonly code?: PluginErrorCode;
	readonly plugin?: string;
	readonly suggestion?: string;

	constructor(
		message: string,
		options: {
			code?: PluginErrorCode;
			plugin?: string;
			suggestion?: string;
		} = {},
	) {
		super(message);
		this.name = "PluginError";
		this.code = options.code;
		this.plugin = options.plugin;
		this.suggestion = options.suggestion;
	}
}
