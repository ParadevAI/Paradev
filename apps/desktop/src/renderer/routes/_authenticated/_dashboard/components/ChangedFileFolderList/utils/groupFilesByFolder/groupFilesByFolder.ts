export const ROOT_FOLDER_KEY = "";

export interface FolderGroup<T> {
	folderPath: string;
	files: T[];
}

/** Groups files by their immediate parent folder; root files first, then folders by path. */
export function groupFilesByFolder<T extends { path: string }>(
	files: T[],
): FolderGroup<T>[] {
	const map = new Map<string, T[]>();
	for (const file of files) {
		const lastSlash = file.path.lastIndexOf("/");
		const folderPath =
			lastSlash >= 0 ? file.path.slice(0, lastSlash) : ROOT_FOLDER_KEY;
		const group = map.get(folderPath);
		if (group) group.push(file);
		else map.set(folderPath, [file]);
	}
	return Array.from(map.entries())
		.map(([folderPath, groupFiles]) => ({
			folderPath,
			files: groupFiles.sort((a, b) =>
				basenameOf(a.path).localeCompare(basenameOf(b.path)),
			),
		}))
		.sort((a, b) => {
			if (a.folderPath === ROOT_FOLDER_KEY)
				return b.folderPath === ROOT_FOLDER_KEY ? 0 : -1;
			if (b.folderPath === ROOT_FOLDER_KEY) return 1;
			return a.folderPath.localeCompare(b.folderPath);
		});
}

function basenameOf(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? path : path.slice(i + 1);
}
