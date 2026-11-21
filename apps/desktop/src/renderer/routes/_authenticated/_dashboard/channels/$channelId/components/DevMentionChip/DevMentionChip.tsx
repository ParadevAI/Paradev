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
			className="rounded bg-accent px-0.5 font-medium text-foreground hover:underline"
		>
			{children}
		</button>
	);
}
