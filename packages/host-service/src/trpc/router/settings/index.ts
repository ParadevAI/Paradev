import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { branchPrefixRouter } from "./branch-prefix";
import { terminalThemeRouter } from "./terminal-theme";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	branchPrefix: branchPrefixRouter,
	terminalTheme: terminalThemeRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { HostWorktreeLocationSettings } from "./worktree-location";
