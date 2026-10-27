import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Circle, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { FileIcon } from "renderer/lib/fileIcons";
import { getBaseName } from "renderer/lib/pathBasename";
import {
	getDocument,
	subscribeDocuments,
} from "../../../../../../state/fileDocumentStore";

interface FileTabProps {
	workspaceId: string;
	filePath: string;
	pinned: boolean;
	isShown: boolean;
	isActive: boolean;
	onSelect: () => void;
	onPin: () => void;
	onClose: () => void;
}

export function FileTab({
	workspaceId,
	filePath,
	pinned,
	isShown,
	isActive,
	onSelect,
	onPin,
	onClose,
}: FileTabProps) {
	const { t } = useLingui();
	const name = getBaseName(filePath);
	const dirty = useSyncExternalStore(
		subscribeDocuments,
		() => getDocument(workspaceId, filePath)?.dirty ?? false,
	);

	return (
		<div
			role="tab"
			tabIndex={-1}
			aria-selected={isShown}
			title={filePath}
			className={cn(
				"group/file-tab flex h-full max-w-48 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border/20 pl-2.5 pr-1 text-xs transition-colors duration-150",
				isShown
					? "bg-background text-foreground"
					: "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
			)}
			onClick={(event) => {
				event.stopPropagation();
				onSelect();
			}}
			onDoubleClick={(event) => {
				event.stopPropagation();
				onPin();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") onSelect();
			}}
			onAuxClick={(event) => {
				if (event.button !== 1) return;
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}}
		>
			<FileIcon fileName={name} className="size-3.5 shrink-0" />
			<span
				className={cn(
					"min-w-0 truncate",
					!pinned && "italic",
					isActive && "font-medium",
				)}
			>
				{name}
			</span>
			<button
				type="button"
				aria-label={t({ message: "Close File" })}
				className="relative flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
				onClick={(event) => {
					event.stopPropagation();
					onClose();
				}}
				onMouseDown={(event) => event.preventDefault()}
			>
				{dirty && (
					<Circle className="size-2 fill-current group-hover/file-tab:hidden" />
				)}
				<X
					className={cn(
						"size-3",
						dirty
							? "hidden group-hover/file-tab:block"
							: isShown
								? "block"
								: "invisible group-hover/file-tab:visible",
					)}
				/>
			</button>
		</div>
	);
}
