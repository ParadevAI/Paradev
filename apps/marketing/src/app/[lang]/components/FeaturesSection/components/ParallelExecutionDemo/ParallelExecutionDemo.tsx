"use client";

import { Trans } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LuCheck, LuEye } from "react-icons/lu";
import { type AgentId, AgentLogo } from "@/app/[lang]/components/AgentLogo";
import { ShimmerText } from "@/app/[lang]/components/ShimmerText";
import { DemoWindow } from "../DemoWindow";

const IN_PROGRESS_TASKS: { id: string; name: string; agent: AgentId }[] = [
	{ id: "task-1", name: "Analyze Tab vs Agent Usage", agent: "claude" },
	{ id: "task-2", name: "PyTorch MNIST Experiments", agent: "codex" },
	{ id: "task-3", name: "Fix PR Comments Fetching", agent: "opencode" },
];

const READY_FOR_REVIEW: {
	id: string;
	name: string;
	agent: AgentId;
}[] = [
	{
		id: "review-1",
		name: "Enterprise Order Management",
		agent: "claude",
	},
	{
		id: "review-2",
		name: "Set up Cursor Rules",
		agent: "cursor",
	},
	{
		id: "review-3",
		name: "Bioinformatics Tools",
		agent: "gemini",
	},
];

const TRANSCRIPT: { kind: "text" | "read" | "done"; text: string }[] = [
	{
		kind: "text",
		text: "I'll implement order validation. Let me examine the existing schema...",
	},
	{ kind: "read", text: "src/schemas/order.ts" },
	{
		kind: "done",
		text: "Added validation for required fields, quantity checks, and price formats.",
	},
];

const STEP_MS = 450;

export function ParallelExecutionDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });
	const [shown, setShown] = useState(0);

	useEffect(() => {
		if (!isInView) return;
		const interval = setInterval(() => {
			setShown((count) => {
				if (count >= TRANSCRIPT.length) clearInterval(interval);
				return Math.min(count + 1, TRANSCRIPT.length);
			});
		}, STEP_MS);
		return () => clearInterval(interval);
	}, [isInView]);

	return (
		<DemoWindow
			windowRef={ref}
			inView={isInView}
			className="w-full min-w-[500px] max-w-2xl"
		>
			<div className="flex h-[360px]">
				<div className="flex w-56 shrink-0 flex-col gap-3 overflow-hidden bg-[#121212] p-2 opacity-70">
					<div className="flex flex-col gap-0.5">
						<div className="flex h-6 items-center px-2 text-[12px] font-medium text-neutral-100/50">
							<Trans>In Progress</Trans>
						</div>
						{IN_PROGRESS_TASKS.map((task, index) => (
							<m.div
								key={task.id}
								className="flex h-7 items-center gap-2 rounded-md px-2"
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
							>
								<AgentLogo agent={task.agent} dimmed />
								<ShimmerText className="min-w-0 flex-1 truncate">
									{task.name}
								</ShimmerText>
							</m.div>
						))}
					</div>

					<div className="flex flex-col gap-0.5">
						<div className="flex h-6 items-center px-2 text-[12px] font-medium text-neutral-100/50">
							<Trans>Ready for Review</Trans>
						</div>
						{READY_FOR_REVIEW.map((task, index) => (
							<m.div
								key={task.id}
								className={`flex h-7 items-center gap-2 rounded-md px-2 ${index === 0 ? "bg-neutral-100/[0.08]" : ""}`}
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
							>
								<AgentLogo agent={task.agent} dimmed={index !== 0} />
								<span
									className={`min-w-0 flex-1 truncate ${index === 0 ? "text-neutral-100/90" : "text-neutral-100/70"}`}
								>
									{task.name}
								</span>
							</m.div>
						))}
					</div>
				</div>

				<div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
					<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
						<div className="self-end rounded-[10px] bg-neutral-100/[0.04] px-3 py-2 text-neutral-100/90">
							Implement order validation
						</div>
						<div className="flex items-center gap-2">
							<AgentLogo agent="claude" />
							<span className="text-neutral-100/90">Claude Code</span>
						</div>
						<div className="flex flex-col gap-2.5">
							{TRANSCRIPT.map((line, index) => (
								<div
									key={line.text}
									className={`flex items-start gap-2 transition-opacity duration-300 motion-reduce:transition-none ${index < shown ? "opacity-100" : "opacity-0"}`}
								>
									{line.kind === "read" && (
										<LuEye className="mt-0.5 size-4 shrink-0 text-neutral-100/40" />
									)}
									{line.kind === "done" && (
										<LuCheck className="mt-0.5 size-4 shrink-0 text-[#58da98]" />
									)}
									<span
										className={
											line.kind === "read"
												? "font-mono text-[12px] text-neutral-100/55"
												: "text-neutral-100/90"
										}
									>
										{line.text}
									</span>
								</div>
							))}
						</div>
					</div>

					<div className="shrink-0 rounded-xl bg-[#232323] px-3 py-2.5 text-neutral-100/55 shadow-[inset_0_0_0_1px_rgb(245_245_245/0.06)]">
						<Trans>Type a task for Claude…</Trans>
					</div>
				</div>
			</div>
		</DemoWindow>
	);
}
