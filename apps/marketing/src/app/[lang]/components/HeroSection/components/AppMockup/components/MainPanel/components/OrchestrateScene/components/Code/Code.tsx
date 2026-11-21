import type { ReactNode } from "react";

interface CodeProps {
	children: ReactNode;
}

export function Code({ children }: CodeProps) {
	return (
		<span className="font-mono text-[12px] text-neutral-100/70">
			{children}
		</span>
	);
}
