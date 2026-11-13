import { splitPath } from "renderer/lib/splitPath";

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
		const folderPath = splitPath(file.path).dir.slice(0, -1);
		const group = map.get(folderPath);
		if (group) group.push(file);
		else map.set(folderPath, [file]);
	}
	return Array.from(map.entries())
		.map(([folderPath, groupFiles]) => ({
			folderPath,
			files: groupFiles.sort((a, b) =>
				splitPath(a.path).name.localeCompare(splitPath(b.path).name),
			),
		}))
		.sort((a, b) => {
			if (a.folderPath === ROOT_FOLDER_KEY)
				return b.folderPath === ROOT_FOLDER_KEY ? 0 : -1;
			if (b.folderPath === ROOT_FOLDER_KEY) return 1;
			return a.folderPath.localeCompare(b.folderPath);
		});
}
