import type { ReactNode } from "react";

interface MemberMentionProps {
	onClick: () => void;
	children: ReactNode;
}

/** "@name" for an agent or a Dev in running text: the mention pill, opening who it names. */
export function MemberMention({ onClick, children }: MemberMentionProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="rounded-[4px] bg-link/14 px-[3px] font-medium text-link hover:bg-link/24"
		>
			{children}
		</button>
	);
}
