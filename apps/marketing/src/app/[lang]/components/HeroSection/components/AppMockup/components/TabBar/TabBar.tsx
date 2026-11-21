"use client";

import { useLingui } from "@lingui/react/macro";
import { LuPanelRight, LuPlus, LuZap } from "react-icons/lu";
import { AgentLogo } from "@/app/[lang]/components/AgentLogo";
import { NEW_CLOUD_SESSION, SCENES } from "../../constants";
import type { ActiveDemo } from "../../types";
import { IconButton } from "../IconButton";
import { Tab } from "./components/Tab";

interface TabBarProps {
	activeDemo: ActiveDemo;
}

export function TabBar({ activeDemo }: TabBarProps) {
	const { t } = useLingui();
	const scene = SCENES[activeDemo];

	return (
		<div className="flex h-8 shrink-0 items-center pl-1">
			<div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)]">
				{activeDemo === "Orchestrate Parallel Agents" && (
					<Tab
						icon={<AgentLogo agent="claude" />}
						label="Settings → modal"
						active
					/>
				)}
				{activeDemo === "Cloud Workspaces" && (
					<Tab
						icon={<AgentLogo agent={NEW_CLOUD_SESSION.agent} />}
						label={NEW_CLOUD_SESSION.title}
						active
					/>
				)}
				{activeDemo === "Automate Tasks" && (
					<Tab
						icon={<LuZap className="size-4 text-neutral-100/90" />}
						label={t({ message: "Automations" })}
						active
					/>
				)}
				{activeDemo === "Publish Pages" && (
					<Tab
						icon={<AgentLogo agent="pi" />}
						label="Onboarding copy pass"
						active
					/>
				)}
				<Tab
					icon={<AgentLogo agent="codex" dimmed />}
					label="Command palette v2"
				/>
				<Tab
					icon={<AgentLogo agent="opencode" />}
					label="Fix flaky auth tests"
					working
				/>
				<IconButton icon={LuPlus} />
			</div>
			<IconButton
				icon={LuPanelRight}
				tone={scene.showChanges ? "active" : "default"}
			/>
		</div>
	);
}
