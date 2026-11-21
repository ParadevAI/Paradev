"use client";

import { m, useInView } from "framer-motion";
import { useRef } from "react";
import { ShimmerText } from "@/app/[lang]/components/ShimmerText";
import { DemoWindow } from "../DemoWindow";

const WORKSPACE_ROWS = [
	{
		name: "fix onboarding crash",
		agent: "claude",
		state: "working",
		running: true,
	},
	{ name: "billing webhooks", agent: "codex", state: "review" },
	{ name: "speed up cold start", agent: "opencode", state: "ready" },
];

export function CliDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<DemoWindow windowRef={ref} inView={isInView} className="w-full max-w-md">
			<div className="flex flex-col gap-1.5 p-4 font-mono text-[12px] leading-5">
				<div>
					<span className="text-neutral-100/40">❯</span>{" "}
					<span className="text-neutral-100/90">superset new</span>{" "}
					<span className="text-neutral-100/55">
						&quot;fix onboarding crash&quot; --agent claude
					</span>
				</div>
				<m.div
					className="text-neutral-100/70"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.25 }}
				>
					<span className="text-[#58da98]">✓</span> workspace ready ·{" "}
					<span className="text-neutral-100/40">fix-onboarding-crash</span>
				</m.div>

				<m.div
					className="pt-2"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.5 }}
				>
					<span className="text-neutral-100/40">❯</span>{" "}
					<span className="text-neutral-100/90">superset ls</span>
				</m.div>
				{WORKSPACE_ROWS.map((row, index) => (
					<m.div
						key={row.name}
						className="flex items-center gap-2 text-neutral-100/70"
						initial={{ opacity: 0 }}
						animate={isInView ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.3, delay: 0.65 + index * 0.12 }}
					>
						<span
							className={row.running ? "text-neutral-100/40" : "text-[#58da98]"}
						>
							{row.running ? "●" : "✓"}
						</span>
						{row.running ? (
							<ShimmerText className="min-w-0 flex-1 truncate">
								{row.name}
							</ShimmerText>
						) : (
							<span className="min-w-0 flex-1 truncate">{row.name}</span>
						)}
						<span className="text-neutral-100/40">{row.agent}</span>
						<span className="w-14 text-right text-neutral-100/40">
							{row.state}
						</span>
					</m.div>
				))}
			</div>
		</DemoWindow>
	);
}
