"use client";

import { useLingui } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import { useRef } from "react";
import { type AgentId, AgentLogo } from "@/app/[lang]/components/AgentLogo";
import { DemoWindow } from "../DemoWindow";

const AGENTS: { id: AgentId; name: string }[] = [
	{ id: "claude", name: "Claude" },
	{ id: "opencode", name: "OpenCode" },
	{ id: "codex", name: "Codex" },
	{ id: "gemini", name: "Gemini" },
	{ id: "cursor", name: "Cursor Agent" },
	{ id: "vibe", name: "Mistral Vibe" },
	{ id: "kimi", name: "Kimi Code" },
	{ id: "grok", name: "Grok CLI" },
	{ id: "hermes", name: "Hermes" },
	{ id: "muse", name: "Muse Code" },
	{ id: "devin", name: "Devin" },
	{ id: "fx", name: "fx" },
	{ id: "agy", name: "Antigravity" },
	{ id: "kiro", name: "Kiro" },
];

export function UniversalCompatibilityDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const { t } = useLingui();
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<DemoWindow
			windowRef={ref}
			inView={isInView}
			className="h-[min(400px,65svh)] w-full max-w-xs"
		>
			<section
				aria-label={t({ message: "Agents" })}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable region must be reachable for keyboard scrolling.
				tabIndex={0}
				className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain p-2 [scrollbar-width:thin] [scrollbar-color:rgb(245_245_245/0.12)_transparent] focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-neutral-100/40"
			>
				{AGENTS.map((agent, index) => (
					<m.div
						key={agent.id}
						className={`flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 hover:bg-neutral-100/[0.06] ${index === 0 ? "bg-neutral-100/[0.08] text-neutral-100/90" : "text-neutral-100/70"}`}
						initial={{ opacity: 0, x: -10 }}
						animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
						transition={{ duration: 0.3, delay: 0.1 + index * 0.08 }}
					>
						<AgentLogo agent={agent.id} />
						<span>{agent.name}</span>
					</m.div>
				))}
			</section>
		</DemoWindow>
	);
}
