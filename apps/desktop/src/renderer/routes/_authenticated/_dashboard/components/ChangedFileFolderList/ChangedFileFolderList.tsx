import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import {
	defaultRangeExtractor,
	measureElement,
	useVirtualizer,
} from "@tanstack/react-virtual";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { type FoldSignal, isFoldCollapsed } from "../../hooks/useFoldSignal";
import { FolderHeader } from "./components/FolderHeader";
import {
	type FolderGroup,
	groupFilesByFolder,
	ROOT_FOLDER_KEY,
} from "./utils/groupFilesByFolder";

const ROOT_FOLDER_LABEL = msg({
	message: "./",
});
// Pre-measure estimate only; the virtualizer measures each row.
const ESTIMATED_ROW_HEIGHT = 26;
const OVERSCAN = 8;

interface ChangedFileFolderListProps<T extends { path: string }> {
	files: T[];
	getFileKey: (file: T) => string;
	renderFile: (file: T) => ReactNode;
	foldSignal: FoldSignal;
}

type Row<T> =
	| { kind: "folder"; key: string; group: FolderGroup<T>; isOpen: boolean }
	| { kind: "file"; key: string; file: T };

/**
 * Changed files grouped by their immediate parent folder (one level deep, not
 * the full tree). Rows are windowed against the nearest
 * `[data-changes-scroll-container]` ancestor; several lists can share that
 * scroller, each offset by its own `offsetTop`.
 *
 * A folder not toggled since the last fold action follows that action, so one
 * that appears later (a search cleared, a new change) matches its neighbours.
 */
export function ChangedFileFolderList<T extends { path: string }>({
	files,
	getFileKey,
	renderFile,
	foldSignal,
}: ChangedFileFolderListProps<T>) {
	const groups = useMemo(() => groupFilesByFolder(files), [files]);
	const [folds, setFolds] = useState(() => ({
		toggled: new Map<string, boolean>(),
		defaultOpen: !isFoldCollapsed(foldSignal),
	}));

	const toggleFolder = useCallback((folderPath: string) => {
		setFolds((prev) => {
			const toggled = new Map(prev.toggled);
			toggled.set(
				folderPath,
				!(prev.toggled.get(folderPath) ?? prev.defaultOpen),
			);
			return { ...prev, toggled };
		});
	}, []);

	const lastFoldEpochRef = useRef(foldSignal.epoch);
	useEffect(() => {
		if (foldSignal.epoch === lastFoldEpochRef.current) return;
		lastFoldEpochRef.current = foldSignal.epoch;
		setFolds({
			toggled: new Map(),
			defaultOpen: foldSignal.action === "expand",
		});
	}, [foldSignal]);

	const rows = useMemo(() => {
		const next: Row<T>[] = [];
		for (const group of groups) {
			const open = folds.toggled.get(group.folderPath) ?? folds.defaultOpen;
			next.push({
				kind: "folder",
				key: `folder:${group.folderPath}`,
				group,
				isOpen: open,
			});
			if (!open) continue;
			for (const file of group.files) {
				next.push({ kind: "file", key: `file:${getFileKey(file)}`, file });
			}
		}
		return next;
	}, [groups, folds, getFileKey]);

	const listRef = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () =>
			listRef.current?.closest(
				"[data-changes-scroll-container]",
			) as HTMLElement | null,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		rangeExtractor: defaultRangeExtractor,
		overscan: OVERSCAN,
		// A hidden panel measures every row at 0; keep the estimate instead.
		measureElement: (element, entry, instance) =>
			measureElement(element, entry, instance) || ESTIMATED_ROW_HEIGHT,
		scrollMargin: listRef.current?.offsetTop ?? 0,
		getItemKey: (index) => rows[index]?.key ?? index,
	});

	return (
		<div ref={listRef}>
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) return null;
					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={virtualizer.measureElement}
							className="absolute left-0 w-full"
							style={{
								top: virtualRow.start - (virtualizer.options.scrollMargin ?? 0),
							}}
						>
							{row.kind === "folder" ? (
								<FolderHeader
									label={
										row.group.folderPath === ROOT_FOLDER_KEY
											? i18n._(ROOT_FOLDER_LABEL)
											: row.group.folderPath
									}
									fileCount={row.group.files.length}
									isOpen={row.isOpen}
									onToggle={() => toggleFolder(row.group.folderPath)}
								/>
							) : (
								renderFile(row.file)
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
