const FILE_ICONS_DIR = "file-icons";

export function resolveFileIconAssetUrl(
	iconName: string,
	baseHref = globalThis.location?.origin ?? "http://localhost",
): string {
	return new URL(`${FILE_ICONS_DIR}/${iconName}.svg`, baseHref).toString();
}
