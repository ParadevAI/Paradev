import stripAnsi from "strip-ansi";

export function parseOnlineHostId(output: string): string | null {
	const matches = [
		...stripAnsi(output).matchAll(
			/\(([0-9a-f]{32})\) is online|"hostId":\s*"([0-9a-f]{32})"/g,
		),
	];
	const last = matches.at(-1);
	return last?.[1] ?? last?.[2] ?? null;
}
