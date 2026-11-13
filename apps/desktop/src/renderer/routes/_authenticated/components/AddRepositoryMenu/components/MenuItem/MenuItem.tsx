import type { ReactNode } from "react";
import { LuChevronRight } from "react-icons/lu";

interface MenuItemProps {
	icon: ReactNode;
	children: ReactNode;
	onClick: () => void;
	/** Opens a further page instead of acting at once. */
	more?: boolean;
	disabled?: boolean;
}

export function MenuItem({
	icon,
	children,
	onClick,
	more = false,
	disabled = false,
}: MenuItemProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
		>
			<span className="text-muted-foreground">{icon}</span>
			<span className="flex-1">{children}</span>
			{more && <LuChevronRight className="size-3.5 text-muted-foreground/70" />}
		</button>
	);
}
