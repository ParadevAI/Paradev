import type { ReactNode } from "react";

interface DiffPlaceholderProps {
	icon: ReactNode;
	message: ReactNode;
	children?: ReactNode;
}

export function DiffPlaceholder({
	icon,
	message,
	children,
}: DiffPlaceholderProps) {
	return (
		<div className="flex min-w-0 flex-col items-center gap-2.5 px-4 py-4 font-sans text-muted-foreground text-xs">
			<span className="flex min-w-0 max-w-full items-center gap-2 [&_svg]:size-4 [&_svg]:shrink-0">
				{icon}
				<span className="min-w-0 cursor-text select-text text-balance text-center">
					{message}
				</span>
			</span>
			{children ? (
				<span className="flex max-w-full flex-wrap justify-center gap-2">
					{children}
				</span>
			) : null}
		</div>
	);
}
