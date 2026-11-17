import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

/**
 * A resource loader whose system prompt is ours, read live rather than once at load: pi rebuilds it from its loader
 * whenever the tool set changes (an app or MCP server given or taken away), and each turn's start rebuilds it so an edit a turn
 * made (a rule, `AGENTS.md`) applies on the next. The preamble opens the prompt; the sections follow it. Nothing pi would
 * discover in the folder (an APPEND_SYSTEM.md the agent wrote) gets in.
 */
export class PromptLoader extends DefaultResourceLoader {
	constructor(
		options: ConstructorParameters<typeof DefaultResourceLoader>[0],
		private readonly prompt: {
			preamble: () => string;
			sections: () => string[];
		},
	) {
		super(options);
	}

	override getSystemPrompt() {
		return this.prompt.preamble();
	}

	override getAppendSystemPrompt() {
		return this.prompt.sections();
	}
}
