import { CLIError } from "@superset/cli-framework";

const EXTENSION_ID = /(?:^|\/)([a-p]{32})(?:$|[/?#])/;

/** Accepts an extension ID or its Chrome Web Store URL. */
export function parseExtensionId(input: string): string {
	const id = EXTENSION_ID.exec(input.trim())?.[1];
	if (!id) {
		throw new CLIError(
			`Not a Chrome extension ID or Web Store URL: ${input}`,
			"An ID is 32 letters from a to p, as in https://chromewebstore.google.com/detail/<name>/<id>",
		);
	}
	return id;
}
