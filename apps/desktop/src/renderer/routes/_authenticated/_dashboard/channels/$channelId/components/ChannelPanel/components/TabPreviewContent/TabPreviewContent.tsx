import type { ReactNode } from "react";

interface TabPreviewContentProps {
	title: ReactNode;
	subtitle?: ReactNode;
	/** Without a body the card shows the icon and title on a gray block. */
	body?: ReactNode;
	icon?: ReactNode;
}

export function TabPreviewContent({
	title,
	subtitle,
	body,
	icon,
}: TabPreviewContentProps) {
	return (
		<>
			<div className="flex min-w-0 flex-col gap-0.5">
				<div className="line-clamp-2 text-sm leading-5 font-medium">
					{title}
				</div>
				{subtitle && (
					<div className="truncate text-xs leading-4 text-muted-foreground">
						{subtitle}
					</div>
				)}
			</div>
			{body ?? (
				<div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg bg-muted text-sm text-muted-foreground">
					{icon && (
						<span className="flex items-center [&_svg]:size-5">{icon}</span>
					)}
					<span className="max-w-full truncate px-4">{title}</span>
				</div>
			)}
		</>
	);
}
