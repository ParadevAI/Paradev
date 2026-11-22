import Image from "next/image";

const LOGO_SRC = {
	claude: "/app-icons/claude.svg",
	opencode: "/app-icons/opencode.svg",
	codex: "/app-icons/codex.svg",
	gemini: "/app-icons/gemini.svg",
	cursor: "/app-icons/cursor-agent.svg",
	vibe: "/app-icons/vibe.svg",
	kimi: "/app-icons/kimi.svg",
	grok: "/app-icons/grok.svg",
	hermes: "/app-icons/hermes.svg",
	muse: "/app-icons/muse.svg",
	devin: "/app-icons/devin.svg",
	fx: "/app-icons/fx.svg",
	agy: "/app-icons/agy.svg",
	kiro: "/app-icons/kiro.svg",
	pi: "/app-icons/pi-white.svg",
} as const;

export type AgentId = keyof typeof LOGO_SRC;

// Logos whose artwork is larger or smaller than the rest inside its viewBox.
const OPTICAL_SCALE: Partial<Record<AgentId, string>> = {
	devin: "scale-125",
	opencode: "scale-[0.8]",
	pi: "scale-110",
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
			className={`size-4 shrink-0 object-contain ${OPTICAL_SCALE[agent] ?? ""} ${dimmed ? "opacity-60 brightness-150 grayscale" : ""}`}
		/>
	);
}
