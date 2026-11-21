"use client";

import { useLingui } from "@lingui/react/macro";
import { m } from "framer-motion";
import { LuGitFork, LuX, LuZap } from "react-icons/lu";
import { SCENES } from "../../constants";
import type { ActiveDemo, PagePhase } from "../../types";
import { AgentLogo } from "../AgentLogo";
import { IconButton } from "../IconButton";
import { AutomationsScene } from "./components/AutomationsScene";
import { DitherClouds } from "./components/DitherClouds";
import { NewCloudWorkspaceDialog } from "./components/NewCloudWorkspaceDialog";
import { OrchestrateScene } from "./components/OrchestrateScene";
import { PagesScene } from "./components/PagesScene";
import { SceneLayer } from "./components/SceneLayer";

interface MainPanelProps {
	activeDemo: ActiveDemo;
	pagePhase: PagePhase;
}

export function MainPanel({ activeDemo, pagePhase }: MainPanelProps) {
	const { t } = useLingui();
	const isAutomate = activeDemo === "Automate Tasks";
	const isCloud = activeDemo === "Cloud Workspaces";
	const isPages = activeDemo === "Publish Pages";
	const isOrchestrate = activeDemo === "Orchestrate Parallel Agents";

	const titles: Record<ActiveDemo, string> = {
		"Orchestrate Parallel Agents": t({
			message: "Plan",
			context: "Name of an agent chat view in the app mockup",
		}),
		"Cloud Workspaces": t({ message: "New workspace" }),
		"Automate Tasks": t({ message: "Automations" }),
		"Publish Pages": t({ message: "Summary" }),
	};

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-r-xl bg-[#161616]">
			<div className="flex h-10 shrink-0 items-center justify-between py-1.5 pr-1.5 pl-3">
				<div className="flex items-center gap-2.5">
					{isAutomate ? (
						<LuZap className="size-4 text-neutral-100/90" />
					) : (
						<AgentLogo agent="claude" />
					)}
					<span className="font-medium text-neutral-100/90">
						{titles[activeDemo]}
					</span>
				</div>
				<div className="flex items-center gap-0.5">
					{SCENES[activeDemo].showChanges && (
						<span className="flex h-7 items-center gap-1.5 rounded-md bg-neutral-100/[0.06] pr-2 pl-1.5 font-medium tabular-nums">
							<LuGitFork className="size-4 text-neutral-100/70" />
							<span className="text-[#58da98]">+128</span>
							<span className="text-[#ff6557]">−41</span>
						</span>
					)}
					<IconButton icon={LuX} />
				</div>
			</div>

			<div className="relative min-h-0 flex-1">
				<SceneLayer visible={isOrchestrate}>
					<OrchestrateScene />
				</SceneLayer>

				<SceneLayer visible={isAutomate}>
					<AutomationsScene />
				</SceneLayer>

				<SceneLayer visible={isCloud}>
					<DitherClouds
						visible={isCloud}
						className="pointer-events-none absolute inset-0 h-full w-full"
					/>
					<div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
						<m.div
							initial={false}
							animate={{ y: isCloud ? 0 : 10, scale: isCloud ? 1 : 0.98 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
						>
							<NewCloudWorkspaceDialog active={isCloud} />
						</m.div>
					</div>
				</SceneLayer>

				<SceneLayer visible={isPages}>
					<PagesScene phase={pagePhase} />
				</SceneLayer>
			</div>
		</div>
	);
}
