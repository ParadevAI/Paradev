import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import {
	Bot,
	Cable,
	Cloud,
	FolderGit2,
	GitBranch,
	GitPullRequest,
	Hash,
	Layers,
	type LucideIcon,
	Monitor,
	SquareCheckBig,
	SquarePen,
	StickyNote,
	TimerReset,
	X,
} from "lucide-react";
import type { MouseEvent } from "react";
import type {
	WindowTabKind,
	WindowTab as WindowTabModel,
} from "renderer/stores/window-tabs";

const KIND_ICONS: Record<WindowTabKind, LucideIcon> = {
	home: SquarePen,
	workspace: GitBranch,
	workspaces: Layers,
	channels: Hash,
	devs: Bot,
	tasks: SquareCheckBig,
	"pull-requests": GitPullRequest,
	pages: StickyNote,
	automations: TimerReset,
	plugins: Cable,
	projects: FolderGit2,
	environments: Monitor,
	"cloud-workspaces": Cloud,
};

interface WindowTabProps {
	tab: WindowTabModel;
	title: string;
	isActive: boolean;
	onActivate: () => void;
	onClose: () => void;
}

export function WindowTab({
	tab,
	title,
	isActive,
	onActivate,
	onClose,
}: WindowTabProps) {
	const { t } = useLingui();
	const Icon = KIND_ICONS[tab.kind];
	const closeOnMiddleClick = (event: MouseEvent<HTMLButtonElement>) => {
		if (event.button === 1) onClose();
	};
	return (
		<div
			className={cn(
				"group flex h-7 max-w-[180px] shrink-0 items-center rounded-lg pr-1 text-xs transition-colors",
				isActive
					? "bg-card text-foreground ring-1 ring-input"
					: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
			)}
		>
			<button
				type="button"
				aria-current={isActive ? "page" : undefined}
				onClick={onActivate}
				onAuxClick={closeOnMiddleClick}
				className="flex h-full min-w-0 items-center gap-1.5 rounded-lg pr-1 pl-2.5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				<Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
				<span className="truncate">{title}</span>
			</button>
			<button
				type="button"
				aria-label={t({ message: `Close ${title}` })}
				onClick={onClose}
				className={cn(
					"flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-fill-hover hover:text-foreground",
					isActive
						? "opacity-100"
						: "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
				)}
			>
				<X className="size-3" />
			</button>
		</div>
	);
}
