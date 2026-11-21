import { AgentLogo } from "@/app/[lang]/components/AgentLogo";
import { ShimmerText } from "@/app/[lang]/components/ShimmerText";
import type { SessionData } from "../../../../types";

interface SessionRowProps {
	session: SessionData;
	active?: boolean;
}

export function SessionRow({ session, active }: SessionRowProps) {
	const isWorking = session.status === "working";
	const needsYou = session.status === "needs";

	return (
		<div
			className={`flex h-7 items-center gap-2 rounded-md px-2 transition-colors duration-200 ${active ? "bg-neutral-100/[0.08]" : ""}`}
		>
			<AgentLogo agent={session.agent} dimmed={!active} />
			{isWorking ? (
				<ShimmerText className="min-w-0 flex-1 truncate">
					{session.title}
				</ShimmerText>
			) : (
				<span
					className={`min-w-0 flex-1 truncate ${active || needsYou ? "text-neutral-100/90" : "text-neutral-100/70"}`}
				>
					{session.title}
				</span>
			)}
			{needsYou && (
				<span className="size-1.5 shrink-0 rounded-full bg-[#ffb02b]" />
			)}
		</div>
	);
}
