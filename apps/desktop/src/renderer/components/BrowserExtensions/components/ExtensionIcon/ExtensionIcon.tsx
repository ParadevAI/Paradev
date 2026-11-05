import { cn } from "@superset/ui/utils";
import type { BrowserExtension } from "main/lib/browser/extension-host/browser-extensions";

interface ExtensionIconProps {
	extension: Pick<BrowserExtension, "icon" | "name">;
	className?: string;
}

export function ExtensionIcon({ extension, className }: ExtensionIconProps) {
	if (extension.icon) {
		return (
			<img
				src={extension.icon}
				alt=""
				draggable={false}
				className={cn("shrink-0 object-contain", className)}
			/>
		);
	}
	return (
		<span
			aria-hidden="true"
			className={cn(
				"flex shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium leading-none text-muted-foreground",
				className,
			)}
		>
			{Array.from(extension.name)[0]?.toUpperCase() ?? ""}
		</span>
	);
}
