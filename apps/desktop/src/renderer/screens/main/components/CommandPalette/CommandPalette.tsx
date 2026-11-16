import { msg } from "@lingui/core/macro";
import { useLingui as useTranslation } from "@lingui/react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CommandPrimitive } from "@superset/ui/command";
import { SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import { FileResultItem } from "renderer/components/FileResultItem";
import { useFileSearch } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/hooks/useFileSearch/useFileSearch";

// 48px input + 10 * 40px items
const MAX_DIALOG_HEIGHT = 448;
const SEARCH_LIMIT = 50;

export interface CommandPaletteProps {
	workspaceId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelectFile: (filePath: string) => void;
}

/** The v1 workspace's file search modal; v2 searches files from the command palette. */
export function CommandPalette({
	workspaceId,
	open,
	onOpenChange,
	onSelectFile,
}: CommandPaletteProps) {
	const { _: translate } = useTranslation();

	const [query, setQuery] = useState("");
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [includePattern, setIncludePattern] = useState("");
	const [excludePattern, setExcludePattern] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const { searchResults } = useFileSearch({
		workspaceId: open ? workspaceId : undefined,
		searchTerm: query,
		includePattern,
		excludePattern,
		limit: SEARCH_LIMIT,
	});

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			onOpenChange(nextOpen);
			if (!nextOpen) setQuery("");
		},
		[onOpenChange],
	);

	const handleSelectFile = useCallback(
		(filePath: string) => {
			onSelectFile(filePath);
			handleOpenChange(false);
		},
		[onSelectFile, handleOpenChange],
	);

	useEffect(() => {
		if (open) requestAnimationFrame(() => inputRef.current?.focus());
	}, [open]);

	return (
		<DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay className="fixed inset-0 z-50" />
				<DialogPrimitive.Content
					className="fixed left-[50%] z-50 w-full max-w-[672px] translate-x-[-50%] overflow-hidden rounded-lg border shadow-lg"
					style={{ top: `calc(50% - ${MAX_DIALOG_HEIGHT / 2}px)` }}
				>
					<DialogPrimitive.Title className="sr-only">
						Quick Open
					</DialogPrimitive.Title>
					<DialogPrimitive.Description className="sr-only">
						Search for files in your workspace
					</DialogPrimitive.Description>

					<CommandPrimitive
						shouldFilter={false}
						className="bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md"
					>
						<div className="flex h-12 items-center gap-2 border-b px-3">
							<SearchIcon className="size-5 shrink-0 opacity-50" />
							<CommandPrimitive.Input
								ref={inputRef}
								placeholder={translate(msg({ message: "Search files..." }))}
								value={query}
								onValueChange={setQuery}
								className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
							/>
							<button
								type="button"
								className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
								onClick={() => setFiltersOpen((v) => !v)}
								aria-label={filtersOpen ? "Hide Filters" : "Show Filters"}
							>
								{filtersOpen ? (
									<LuChevronDown className="size-4" />
								) : (
									<LuChevronRight className="size-4" />
								)}
							</button>
						</div>

						{filtersOpen && (
							<div className="grid grid-cols-2 gap-2 border-b px-3 py-2">
								<input
									value={includePattern}
									onChange={(e) => setIncludePattern(e.target.value)}
									placeholder={translate(
										msg({ message: "files to include (glob)" }),
									)}
									className="h-8 rounded border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
								/>
								<input
									value={excludePattern}
									onChange={(e) => setExcludePattern(e.target.value)}
									placeholder={translate(
										msg({ message: "files to exclude (glob)" }),
									)}
									className="h-8 rounded border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
								/>
							</div>
						)}

						<CommandPrimitive.List className="max-h-[400px] overflow-x-hidden overflow-y-auto scroll-py-1 p-1">
							{searchResults.length === 0 && (
								<CommandPrimitive.Empty className="py-6 text-center text-sm text-muted-foreground">
									No files found.
								</CommandPrimitive.Empty>
							)}
							{searchResults.map((file) => (
								<FileResultItem
									key={file.id}
									value={file.path}
									fileName={file.name}
									relativePath={file.relativePath}
									onSelect={() => handleSelectFile(file.path)}
								/>
							))}
						</CommandPrimitive.List>
					</CommandPrimitive>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
