import type { ReactNode } from "react";

const CHIP_CLASS =
	"rounded bg-accent px-0.5 font-medium text-foreground hover:underline";

interface ChannelRefChipProps {
	children: ReactNode;
	/** Without it the chip is plain text, as inside the composer. */
	onClick?: () => void;
}

export function ChannelRefChip({ children, onClick }: ChannelRefChipProps) {
	if (!onClick) return <span className={CHIP_CLASS}>{children}</span>;
	return (
		<button type="button" onClick={onClick} className={CHIP_CLASS}>
			{children}
		</button>
	);
}
