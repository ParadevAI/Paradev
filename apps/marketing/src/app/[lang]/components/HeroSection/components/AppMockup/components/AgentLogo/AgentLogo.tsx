import Image from "next/image";
import type { AgentId } from "../../types";

const LOGO_SRC: Record<AgentId, string> = {
	claude: "/app-icons/claude.svg",
	codex: "/app-icons/codex.svg",
	opencode: "/app-icons/opencode.svg",
	gemini: "/app-icons/gemini.svg",
};

interface AgentLogoProps {
	agent: AgentId;
	dimmed?: boolean;
}

export function AgentLogo({ agent, dimmed }: AgentLogoProps) {
	return (
		<Image
			src={LOGO_SRC[agent]}
			alt=""
			width={16}
			height={16}
			className={`size-4 shrink-0 ${dimmed ? "opacity-60 grayscale" : ""}`}
		/>
	);
}
