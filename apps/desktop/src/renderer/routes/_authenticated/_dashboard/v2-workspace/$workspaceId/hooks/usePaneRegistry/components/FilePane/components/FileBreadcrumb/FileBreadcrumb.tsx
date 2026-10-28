import { Fragment } from "react";
import { LuChevronRight } from "react-icons/lu";
import { FileIcon } from "renderer/lib/fileIcons";
import { toRelativeWorkspacePath } from "shared/absolute-paths";

interface FileBreadcrumbProps {
	filePath: string;
	rootPath?: string;
	dirty: boolean;
}

export function FileBreadcrumb({
	filePath,
	rootPath,
	dirty,
}: FileBreadcrumbProps) {
	const relativePath = rootPath
		? toRelativeWorkspacePath(rootPath, filePath)
		: filePath;
	const segments = relativePath.split(/[\\/]/).filter(Boolean);
	return (
		<div
			className="pointer-events-auto absolute top-2 left-2 z-10 flex h-7 max-w-[calc(100%-1rem)] items-center gap-1 overflow-hidden rounded-full border border-border/60 bg-background px-3 text-xs text-muted-foreground shadow-sm"
			title={filePath}
		>
			{segments.map((segment, index) => {
				const isLast = index === segments.length - 1;
				return (
					<Fragment key={`${index}:${segment}`}>
						{index > 0 && (
							<LuChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
						)}
						{isLast ? (
							<span className="flex shrink-0 items-center gap-1.5 text-foreground">
								<FileIcon fileName={segment} className="size-3.5 shrink-0" />
								{segment}
								{dirty && (
									<span className="size-2 shrink-0 rounded-full bg-muted-foreground" />
								)}
							</span>
						) : (
							<span className="min-w-0 truncate">{segment}</span>
						)}
					</Fragment>
				);
			})}
		</div>
	);
}
