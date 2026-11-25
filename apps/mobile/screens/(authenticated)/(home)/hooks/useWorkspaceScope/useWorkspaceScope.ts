import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/utils/scopeSelection";
import { useScopeSelection } from "../useScopeSelection";

export function useWorkspaceScope(): WorkspaceScope {
	return useScopeSelection().scope;
}
