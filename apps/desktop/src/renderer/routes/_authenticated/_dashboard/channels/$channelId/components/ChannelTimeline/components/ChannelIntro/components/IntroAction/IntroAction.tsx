import type { ReactNode } from "react";

interface IntroActionProps {
	icon: ReactNode;
	onClick: () => void;
	children: ReactNode;
}

export function IntroAction({ icon, onClick, children }: IntroActionProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-fill-hover [&_svg]:size-4"
		>
			{icon}
			{children}
		</button>
	);
}
