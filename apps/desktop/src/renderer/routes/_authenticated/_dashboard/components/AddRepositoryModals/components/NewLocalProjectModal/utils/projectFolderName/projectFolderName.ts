/** The project name as one folder name that stays inside its parent. */
export function projectFolderName(name: string): string {
	const folder = name
		// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are not valid in folder names
		.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
		.trim()
		.replace(/^[.\s]+|[.\s]+$/g, "");
	return folder || "project";
}
