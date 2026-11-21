"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	LuArrowLeft,
	LuArrowRight,
	LuPanelLeft,
	LuSearch,
	LuSquarePen,
} from "react-icons/lu";
import {
	CLOUD_GROUP_ID,
	NEW_CLOUD_SESSION,
	SCENES,
	SESSION_GROUPS,
} from "../../constants";
import type { ActiveDemo } from "../../types";
import { IconButton } from "../IconButton";
import { WindowRail } from "../WindowRail";
import { SessionRow } from "./components/SessionRow";

interface LeftSidebarProps {
	activeDemo: ActiveDemo;
}

export function LeftSidebar({ activeDemo }: LeftSidebarProps) {
	const { t } = useLingui();
	const scene = SCENES[activeDemo];
	const isCloud = activeDemo === "Cloud Workspaces";

	return (
		<div className="flex w-[268px] shrink-0 flex-col">
			<div className="flex h-10 shrink-0 items-center gap-3 pl-3.5">
				<div className="flex items-center gap-2">
					<div className="size-3 rounded-full bg-[#ff5f57]" />
					<div className="size-3 rounded-full bg-[#febc2e]" />
					<div className="size-3 rounded-full bg-[#28c840]" />
				</div>
				<div className="flex items-center">
					<IconButton icon={LuPanelLeft} />
					<IconButton icon={LuArrowLeft} />
					<IconButton icon={LuArrowRight} tone="faint" />
				</div>
			</div>

			<div className="flex min-h-0 flex-1">
				<WindowRail active={scene.rail} />
				<div className="flex min-w-0 flex-1 flex-col pb-1">
					<div className="flex min-h-0 flex-1 flex-col gap-3 rounded-l-xl bg-[#121212] px-2 pt-1.5 pb-2 opacity-60">
						<div className="flex items-center gap-1">
							<div className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md bg-neutral-100/[0.06] pr-1 pl-2">
								<LuSearch className="size-4 shrink-0 text-neutral-100/55" />
								<span className="min-w-0 flex-1 truncate text-neutral-100/40">
									<Trans>Search</Trans>
								</span>
							</div>
							<IconButton icon={LuSquarePen} />
						</div>

						<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
							{SESSION_GROUPS.map((group) => (
								<div key={group.id} className="flex flex-col gap-0.5">
									<div className="flex h-6 items-center gap-1.5 pr-1.5 pl-2 text-[12px] leading-4">
										<span className="min-w-0 flex-1 truncate font-medium text-neutral-100/50">
											{typeof group.label === "string"
												? group.label
												: t(group.label)}
										</span>
									</div>
									{group.id === CLOUD_GROUP_ID && (
										<div
											className={`grid transition-[grid-template-rows,opacity] duration-[250ms] ease-out motion-reduce:transition-none ${isCloud ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
										>
											<div className="min-h-0 overflow-hidden">
												<div className="pb-0.5">
													<SessionRow session={NEW_CLOUD_SESSION} active />
												</div>
											</div>
										</div>
									)}
									{group.sessions.map((session) => (
										<SessionRow
											key={session.title}
											session={session}
											active={session.title === scene.activeSession}
										/>
									))}
								</div>
							))}
						</div>

						<div className="flex h-6 shrink-0 items-center gap-1.5 pr-1.5 pl-2 text-[12px] leading-4">
							<span className="min-w-0 flex-1 truncate font-medium text-neutral-100/50">
								<Trans>Settled</Trans>
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
