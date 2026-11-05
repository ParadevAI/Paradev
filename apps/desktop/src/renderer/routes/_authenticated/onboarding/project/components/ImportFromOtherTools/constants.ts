import cursorIcon from "renderer/assets/app-icons/cursor.svg";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import conductorIcon from "./assets/conductor.png";
import emdashIcon from "./assets/emdash.svg";
import orcaIcon from "./assets/orca.png";
import t3codeIcon from "./assets/t3code.png";

export type ExternalWorktreeRepo = Awaited<
	ReturnType<HostServiceClient["project"]["detectExternalWorktrees"]["query"]>
>["repos"][number];

export type ExternalWorktreeSource =
	ExternalWorktreeRepo["worktrees"][number]["source"];

export const SOURCE_NAMES: Record<ExternalWorktreeSource, string> = {
	conductor: "Conductor",
	t3code: "T3 Code",
	orca: "Orca",
	emdash: "Emdash",
	"claude-squad": "Claude Squad",
	cursor: "Cursor",
	herdr: "Herdr",
	paseo: "Paseo",
};

export const SOURCE_ICONS: Partial<Record<ExternalWorktreeSource, string>> = {
	conductor: conductorIcon,
	t3code: t3codeIcon,
	orca: orcaIcon,
	emdash: emdashIcon,
	cursor: cursorIcon,
};

export const MAX_ICONS = 3;
