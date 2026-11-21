/** An app path as the browser sees it, under the web export's base path. */
export function appUrl(path: string): string {
	return `${process.env.EXPO_BASE_URL ?? ""}${path}`;
}
