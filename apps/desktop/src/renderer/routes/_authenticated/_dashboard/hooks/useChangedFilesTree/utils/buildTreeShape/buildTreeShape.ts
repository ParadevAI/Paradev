export interface TreeShape {
	/** Every directory path implied by the files, sorted shallow→deep (ancestors first). */
	dirs: string[];
	/** Directory path → count of files anywhere beneath it. */
	dirFileCount: Map<string, number>;
	/** Directories whose only child is another directory; a flattened tree draws them as one row with it. */
	chainDirs: Set<string>;
}

/** Derive the directory hierarchy + per-directory file counts from a flat list of file paths. */
export function buildTreeShape(paths: string[]): TreeShape {
	const dirs: string[] = [];
	const dirFileCount = new Map<string, number>();
	const childrenByDir = new Map<string, Set<string>>();
	for (const path of paths) {
		const segments = path.split("/");
		let acc = "";
		for (let i = 0; i < segments.length - 1; i++) {
			acc = acc ? `${acc}/${segments[i]}` : segments[i];
			let children = childrenByDir.get(acc);
			if (!children) {
				children = new Set();
				childrenByDir.set(acc, children);
				dirs.push(acc);
			}
			children.add(
				i < segments.length - 2 ? `${segments[i + 1]}/` : segments[i + 1],
			);
			dirFileCount.set(acc, (dirFileCount.get(acc) ?? 0) + 1);
		}
	}
	dirs.sort(
		(a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
	);
	const chainDirs = new Set<string>();
	for (const [dir, children] of childrenByDir) {
		const [only] = children;
		if (children.size === 1 && only?.endsWith("/")) chainDirs.add(dir);
	}
	return { dirs, dirFileCount, chainDirs };
}
