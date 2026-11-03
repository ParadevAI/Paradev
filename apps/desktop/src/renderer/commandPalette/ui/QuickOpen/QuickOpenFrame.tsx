import { Trans } from "@lingui/react/macro";
import {
	CommandEmpty,
	CommandGroup,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { useMemo } from "react";
import { FileResultItem } from "renderer/components/FileResultItem";
import { RECENT_DISPLAY_LIMIT } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useRecentlyViewedFiles";
import { useFrameStackStore } from "../../core/frames";
import { useCommandPaletteQuery } from "../CommandPalette/CommandPalette";
import { useV2FileSearch } from "./hooks/useV2FileSearch";
import { useQuickOpenStore } from "./quickOpenStore";
import { orderRecentFiles } from "./utils/orderRecentFiles";

function fileNameOf(relativePath: string): string {
	return relativePath.split("/").at(-1) ?? relativePath;
}

/** The files frame: recently viewed files, then matches from the open workspace. */
export function QuickOpenFrame() {
	const query = useCommandPaletteQuery();
	const provider = useQuickOpenStore((s) => s.provider);
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const { results } = useV2FileSearch(provider, query);

	const recent = useMemo(
		() =>
			provider
				? orderRecentFiles(
						provider.recentFiles,
						provider.openFilePaths,
						query,
						RECENT_DISPLAY_LIMIT,
					)
				: [],
		[provider, query],
	);
	const recentPaths = useMemo(
		() => new Set(recent.map((file) => file.absolutePath)),
		[recent],
	);
	const matches = results.filter((file) => !recentPaths.has(file.path));

	const select = (filePath: string) => {
		setOpen(false);
		provider?.onSelectFile(filePath);
	};

	return (
		<CommandList>
			<CommandEmpty>
				<Trans>No results</Trans>
			</CommandEmpty>
			{recent.length > 0 ? (
				<CommandGroup heading={<Trans>Recently Viewed</Trans>}>
					{recent.map((file) => (
						<FileResultItem
							key={`recent:${file.absolutePath}`}
							value={`recent:${file.absolutePath}`}
							fileName={fileNameOf(file.relativePath)}
							relativePath={file.relativePath}
							onSelect={() => select(file.absolutePath)}
						/>
					))}
				</CommandGroup>
			) : null}
			{recent.length > 0 && matches.length > 0 ? (
				<CommandSeparator alwaysRender className="my-1" />
			) : null}
			{matches.length > 0 ? (
				<CommandGroup>
					{matches.map((file) => (
						<FileResultItem
							key={file.id}
							value={file.path}
							fileName={file.name}
							relativePath={file.relativePath}
							onSelect={() => select(file.path)}
						/>
					))}
				</CommandGroup>
			) : null}
		</CommandList>
	);
}
