import { localDbWorkspaceViewStorage } from "./local-db-storage";
import { WorkspaceViews } from "./workspace-views";

export type { WorkspaceViewChange } from "./workspace-views";

export const workspaceViews = new WorkspaceViews(localDbWorkspaceViewStorage);
