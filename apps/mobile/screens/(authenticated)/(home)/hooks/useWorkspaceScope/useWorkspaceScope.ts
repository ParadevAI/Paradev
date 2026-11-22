import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import { useScopeSelection } from "../useScopeSelection";

/** One machine, Cloud alone, or several places under labels. */
export function useWorkspaceScope(): WorkspaceScope {
	return useScopeSelection().scope;
}
