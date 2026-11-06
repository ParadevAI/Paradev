import type { ReactNode } from "react";

/** The small text button a section offers at its end. */
export function PaneSectionAction({
	children,
	onClick,
}: {
	children: ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground [&_svg]:size-3"
		>
			{children}
		</button>
	);
}
