import Image from "next/image";
import type { IconType } from "react-icons";
import {
	LuFileText,
	LuGitPullRequest,
	LuLayers,
	LuPlug,
	LuSettings,
	LuSquareCheck,
	LuZap,
} from "react-icons/lu";
import type { RailSection } from "../../types";
import { IconButton } from "../IconButton";

const SECTIONS: {
	id: RailSection | "tasks" | "prs" | "plugins";
	icon: IconType;
}[] = [
	{ id: "workspaces", icon: LuLayers },
	{ id: "automations", icon: LuZap },
	{ id: "tasks", icon: LuSquareCheck },
	{ id: "prs", icon: LuGitPullRequest },
	{ id: "pages", icon: LuFileText },
	{ id: "plugins", icon: LuPlug },
];

interface WindowRailProps {
	active: RailSection;
}

export function WindowRail({ active }: WindowRailProps) {
	return (
		<div className="flex w-10 shrink-0 flex-col justify-between p-1.5">
			<div className="flex flex-col gap-1">
				{SECTIONS.map((section) => (
					<IconButton
						key={section.id}
						icon={section.icon}
						tone={section.id === active ? "active" : "default"}
					/>
				))}
			</div>
			<div className="flex flex-col gap-2">
				<IconButton icon={LuSettings} />
				<span className="flex size-7 items-center justify-center">
					<Image
						src="/app-icons/paradev.png"
						alt=""
						width={24}
						height={24}
						className="size-6 rounded-md"
					/>
				</span>
			</div>
		</div>
	);
}
