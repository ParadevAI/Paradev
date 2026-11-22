import { useMemo } from "react";
import type { LinkTierMap } from "../types";
import { buildPolicy, type ClickPolicy } from "./policy";

/** Pull request links in a workspace: plain click opens the PR pane, modifier clicks reach GitHub. */
export const PULL_REQUEST_LINKS: LinkTierMap = {
	plain: "pane",
	shift: "newTab",
	meta: "external",
	metaShift: "external",
};

export function usePullRequestLinkPolicy(): ClickPolicy {
	return useMemo(() => buildPolicy(PULL_REQUEST_LINKS, "url", "4-tier"), []);
}
