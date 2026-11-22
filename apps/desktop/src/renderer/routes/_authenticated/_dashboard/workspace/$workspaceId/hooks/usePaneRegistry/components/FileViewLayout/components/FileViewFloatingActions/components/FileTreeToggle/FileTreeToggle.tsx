import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuFolderTree } from "react-icons/lu";
import { useFileTreeVisibilityStore } from "../../../../../../../../state/fileTreeVisibilityStore";

interface FileTreeToggleProps {
	visible?: boolean;
	onToggle?: () => void;
}

export function FileTreeToggle({
	visible: visibleOverride,
	onToggle,
}: FileTreeToggleProps) {
	const { t } = useLingui();
	const storedVisible = useFileTreeVisibilityStore((state) => state.visible);
	const storedToggle = useFileTreeVisibilityStore((state) => state.toggle);
	const visible = visibleOverride ?? storedVisible;
	const toggle = onToggle ?? storedToggle;
	const label = visible
		? t({ message: "Hide file tree" })
		: t({ message: "Show file tree" });
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={visible}
					onClick={toggle}
					className={cn(
						"rounded p-1 transition-colors",
						visible
							? "bg-accent text-foreground"
							: "text-muted-foreground/60 hover:text-muted-foreground",
					)}
				>
					<LuFolderTree className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
