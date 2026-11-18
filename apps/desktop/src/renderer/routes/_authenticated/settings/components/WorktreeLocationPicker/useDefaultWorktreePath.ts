import { electronTrpc } from "renderer/lib/electron-trpc";

export function useDefaultWorktreePath() {
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	return homeDir ? `${homeDir}/.paradev/worktrees` : "~/.paradev/worktrees";
}
