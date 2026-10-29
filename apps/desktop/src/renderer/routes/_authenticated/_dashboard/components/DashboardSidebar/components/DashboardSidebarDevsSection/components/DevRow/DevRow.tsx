import type { RouterOutputs } from "@superset/trpc";
import { cn } from "@superset/ui/utils";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";

type SidebarDev = RouterOutputs["agent"]["list"][number];

interface DevRowProps {
	dev: SidebarDev;
	isActive: boolean;
	onClick: () => void;
}

export function DevRow({ dev, isActive, onClick }: DevRowProps) {
	const isPaused = dev.pausedAt !== null;
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex h-7 w-full items-center gap-2 rounded-md px-2 text-[13px] font-normal transition-colors",
				isActive
					? "bg-fill-selected text-foreground"
					: "text-muted-foreground hover:bg-fill-hover hover:text-foreground",
			)}
		>
			<DevAvatar
				avatar={dev.avatar}
				size={16}
				mood={isPaused ? "asleep" : "idle"}
			/>
			<span className="min-w-0 flex-1 truncate text-left">{dev.name}</span>
		</button>
	);
}
