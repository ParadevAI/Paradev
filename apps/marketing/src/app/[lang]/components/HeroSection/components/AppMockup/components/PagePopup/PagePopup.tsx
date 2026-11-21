"use client";

import { Trans } from "@lingui/react/macro";
import { AnimatePresence, m } from "framer-motion";
import { LuBot, LuCheck, LuLock, LuShare } from "react-icons/lu";
import type { PagePhase } from "../../types";
import { Comment } from "./components/Comment";
import { StatTile } from "./components/StatTile";
import { AFTER_BARS, BEFORE_BARS } from "./constants";

interface PagePopupProps {
	visible: boolean;
	phase: PagePhase;
}

export function PagePopup({ visible, phase }: PagePopupProps) {
	const commented = phase !== "published";
	const revised = phase === "revised";

	return (
		<m.div
			className="absolute top-[300px] right-5 w-[66%] overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			style={{ pointerEvents: visible ? "auto" : "none" }}
			aria-hidden={!visible}
			initial={false}
			animate={{
				opacity: visible ? 1 : 0,
				scale: visible ? 1 : 0.96,
				y: visible ? 0 : 16,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			<div className="flex h-9 items-center gap-3 border-b border-border/60 bg-card px-3 text-[11px]">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 font-mono text-[10px] text-muted-foreground/70">
					<LuLock className="size-2.5 shrink-0" />
					<span className="truncate">
						app.paradev.com/page/
						<span className="text-foreground/85">onboarding-redesign</span>
					</span>
				</div>
				<span className="font-medium text-foreground/90">
					<Trans>Onboarding redesign</Trans>
				</span>
				<m.span
					key={revised ? "v2" : "v1"}
					className={`rounded-sm border px-1.5 font-mono text-[10px] ${revised ? "border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}
					initial={{ opacity: 0.4, scale: 0.9 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.25 }}
				>
					{revised ? "v2" : "v1"}
				</m.span>
				<span className="flex items-center gap-1.5 text-muted-foreground/75">
					<span className="size-1.5 rounded-full bg-emerald-500" />
					claude
				</span>
				<span className="flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-muted-foreground/80">
					<LuShare className="size-2.5" />
					<Trans>Share</Trans>
				</span>
			</div>

			<div className="grid grid-cols-[1fr_230px]">
				<div className="px-6 pt-5 pb-6">
					<p className="font-mono text-[9px] uppercase tracking-[0.16em] text-brand">
						<Trans>Design review</Trans>
					</p>
					<div className="relative mt-1.5 inline-block">
						<p
							className={`rounded-sm text-[22px] font-medium leading-tight tracking-tight text-foreground transition-[outline-color] duration-200 outline-1 outline-offset-4 outline-dashed ${phase === "commented" ? "outline-blue-500" : "outline-transparent"}`}
						>
							<Trans>Sign up in one step</Trans>
							<AnimatePresence>
								{revised && (
									<m.span
										className="block rounded-sm bg-emerald-500/15"
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: "auto" }}
										exit={{ opacity: 0, height: 0 }}
										transition={{ duration: 0.3 }}
									>
										<Trans>Start building in two.</Trans>
									</m.span>
								)}
							</AnimatePresence>
						</p>
						<AnimatePresence>
							{commented && (
								<m.span
									className={`absolute -top-3 -right-6 flex size-5 items-center justify-center rounded-full rounded-bl-sm text-[9px] font-medium text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-white ${revised ? "bg-neutral-500" : "bg-blue-600"}`}
									initial={{ scale: 0 }}
									animate={{ scale: 1 }}
									exit={{ scale: 0 }}
									transition={{ type: "spring", stiffness: 500, damping: 26 }}
								>
									1
								</m.span>
							)}
						</AnimatePresence>
					</div>
					<div className="mt-3 max-w-[340px] space-y-1.5">
						<div className="h-1.5 w-full rounded-full bg-muted" />
						<div className="h-1.5 w-4/5 rounded-full bg-muted" />
					</div>

					<div className="mt-5 grid grid-cols-3 gap-2">
						<StatTile
							label={<Trans>Sign-up completion</Trans>}
							value="68%"
							delta="+42%"
						/>
						<StatTile
							label={<Trans>Time to first workspace</Trans>}
							value="2m 10s"
							delta="−35%"
						/>
						<StatTile
							label={<Trans>Sign-up steps</Trans>}
							value="1"
							delta="−3"
						/>
					</div>

					<div className="mt-3 rounded-md border border-border/70 bg-card/60 px-3 pt-2.5 pb-2">
						<div className="flex items-center gap-3 text-[10px]">
							<span className="font-medium text-foreground/85">
								<Trans>Weekly sign-up completion</Trans>
							</span>
							<span className="ml-auto flex items-center gap-1 text-muted-foreground/65">
								<span className="size-1.5 rounded-[2px] bg-muted-foreground/35" />
								<Trans>Before</Trans>
							</span>
							<span className="flex items-center gap-1 text-muted-foreground/65">
								<span className="size-1.5 rounded-[2px] bg-brand" />
								<Trans>After</Trans>
							</span>
						</div>
						<div className="relative mt-2 h-[104px]">
							{[0, 1, 2].map((line) => (
								<div
									key={line}
									className="absolute inset-x-0 border-t border-dashed border-border/50"
									style={{ top: `${line * 33}%` }}
								/>
							))}
							<div className="absolute inset-0 flex items-end gap-[6px] border-b border-border/80">
								{[...BEFORE_BARS, ...AFTER_BARS].map((height, index) => {
									const isAfter = index >= BEFORE_BARS.length;
									return (
										<m.div
											key={`${index}-${height}`}
											className={`flex-1 origin-bottom rounded-t-[3px] ${isAfter ? "bg-brand/85" : "bg-muted-foreground/30"}`}
											style={{ height: `${height}%` }}
											initial={false}
											animate={{ scaleY: visible ? 1 : 0 }}
											transition={{
												duration: 0.45,
												ease: "easeOut",
												delay: visible ? 0.15 + index * 0.05 : 0,
											}}
										/>
									);
								})}
							</div>
						</div>
						<div className="mt-1 flex justify-between font-mono text-[8.5px] text-muted-foreground/45">
							<span>W1</span>
							<span>W4</span>
							<span>W7</span>
							<span>W10</span>
						</div>
					</div>
				</div>

				<div className="flex flex-col border-l border-border/60 bg-card/40">
					<div className="flex h-9 items-center gap-2 border-b border-border/60 px-3 text-[11px] font-medium text-foreground/90">
						<Trans>Comments</Trans>
						<span className="rounded-full bg-foreground/[0.08] px-1.5 font-mono text-[9px] tabular-nums text-muted-foreground">
							{commented ? 1 : 0}
						</span>
					</div>
					<div className="flex flex-1 flex-col gap-3 p-3">
						<AnimatePresence>
							{commented && (
								<Comment
									key="maya"
									avatar="MA"
									name="Maya"
									time={<Trans>4 min ago</Trans>}
								>
									<Trans>
										Can the headline say what happens after sign-up?
									</Trans>
								</Comment>
							)}
							{revised && (
								<Comment
									key="agent"
									avatar={<LuBot className="size-2.5" />}
									name={<Trans>Agent</Trans>}
									time={<Trans>just now</Trans>}
								>
									<Trans>Rewrote it and published version 2.</Trans>
								</Comment>
							)}
						</AnimatePresence>
					</div>
					<AnimatePresence>
						{revised && (
							<m.div
								className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground/70"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.25, delay: 0.3 }}
							>
								<LuCheck className="size-3 text-emerald-400/85" />
								<Trans>Resolved</Trans>
								<span className="ml-auto font-mono">v1 → v2</span>
							</m.div>
						)}
					</AnimatePresence>
				</div>
			</div>
		</m.div>
	);
}
