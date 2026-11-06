import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MemberMention } from "../MemberMention";

interface DevMentionChipProps {
	agentId: string;
	children: ReactNode;
}

export function DevMentionChip({ agentId, children }: DevMentionChipProps) {
	const navigate = useNavigate();
	return (
		<MemberMention
			onClick={() =>
				void navigate({ to: "/devs/$devId", params: { devId: agentId } })
			}
		>
			{children}
		</MemberMention>
	);
}
