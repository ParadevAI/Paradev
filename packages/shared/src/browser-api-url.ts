export function getBrowserApiUrl(env: {
	BROWSER_API_URL?: string;
	NEXT_PUBLIC_API_URL: string;
}): string {
	return env.BROWSER_API_URL || env.NEXT_PUBLIC_API_URL;
}
