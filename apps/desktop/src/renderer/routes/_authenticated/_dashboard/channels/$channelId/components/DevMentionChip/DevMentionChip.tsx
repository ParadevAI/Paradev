import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface DevMentionChipProps {
	agentId: string;
	children: ReactNode;
}

export function DevMentionChip({ agentId, children }: DevMentionChipProps) {
	const navigate = useNavigate();
	return (
		<button
			type="button"
			onClick={() =>
				void navigate({ to: "/devs/$devId", params: { devId: agentId } })
			}
			className="rounded-[4px] bg-link/14 px-[3px] font-medium text-link hover:bg-link/24"
		>
			{children}
		</button>
	);
}
