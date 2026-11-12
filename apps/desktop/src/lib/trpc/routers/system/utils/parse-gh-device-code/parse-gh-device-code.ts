import stripAnsi from "strip-ansi";

export const GH_DEVICE_URL = "https://github.com/login/device";

const CODE_PATTERN = /one-time code(?::\s*|\s*\()([A-Z0-9]{4}-[A-Z0-9]{4})/i;
const URL_PATTERN = /https:\/\/\S+\/login\/device/;

export interface GhDeviceCode {
	code: string;
	url: string;
}

/** Reads the device code from `gh auth login --web` output, old and new wording. */
export function parseGhDeviceCode(output: string): GhDeviceCode | null {
	const text = stripAnsi(output);
	const code = text.match(CODE_PATTERN)?.[1];
	if (!code) return null;
	return {
		code: code.toUpperCase(),
		url: text.match(URL_PATTERN)?.[0] ?? GH_DEVICE_URL,
	};
}
