"use client";

import { Trans } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import { useRef } from "react";
import { LuClock, LuGitPullRequestDraft } from "react-icons/lu";
import { SiSentry } from "react-icons/si";
import { DemoWindow } from "../DemoWindow";

const CHIP =
	"inline-flex h-5 items-center rounded-[5px] bg-neutral-100/[0.08] px-1.5 text-neutral-100/90";
const TRIGGER = "flex h-8 items-center gap-2 px-2.5 text-neutral-100/55";

export function AutomationsDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<DemoWindow
			windowRef={ref}
			inView={isInView}
			className="w-full max-w-md gap-4 p-5"
		>
			<div className="flex items-center gap-2.5">
				<span className="text-[15px] font-medium text-neutral-100/90">
					<Trans>Fix production bugs</Trans>
				</span>
				<span className="flex h-3.5 w-6 items-center justify-end rounded-full bg-[#58da98]/80 p-0.5">
					<span className="size-2.5 rounded-full bg-white" />
				</span>
			</div>

			<div className="rounded-lg bg-black/20 py-1 shadow-[inset_0_0_0_1px_rgb(245_245_245/0.06)]">
				<div className={TRIGGER}>
					<SiSentry className="size-3.5 shrink-0" />
					<span>
						<Trans>
							Sentry issue created in <span className={CHIP}>web</span>
						</Trans>
					</span>
				</div>
				<div className={TRIGGER}>
					<LuClock className="size-3.5 shrink-0" />
					<span>
						<Trans>
							Every day at <span className={CHIP}>9:00 AM</span>
						</Trans>
					</span>
				</div>
			</div>

			<m.div
				className="-mt-4 flex flex-col items-start"
				initial={{ opacity: 0, y: 6 }}
				animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
				transition={{ duration: 0.4, delay: 0.6 }}
			>
				<span className="ml-[17px] h-5 w-px bg-neutral-100/15" />
				<div className="flex h-9 w-full items-center gap-2 rounded-lg bg-neutral-100/[0.06] px-2.5">
					<LuGitPullRequestDraft className="size-4 shrink-0 text-neutral-100/55" />
					<span className="text-neutral-100/90">
						<Trans>Draft PR #2841</Trans>
					</span>
					<span className="ml-auto font-mono text-[12px] tabular-nums">
						<span className="text-[#58da98]">+24</span>{" "}
						<span className="text-[#ff6557]">−3</span>
					</span>
				</div>
			</m.div>
		</DemoWindow>
	);
}
