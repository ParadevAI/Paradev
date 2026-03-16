export type DashboardSidebarWorkspaceHostType =
	| "local-device"
	| "remote-device"
	| "cloud";

export interface DashboardSidebarWorkspace {
	id: string;
	projectId: string;
	deviceId: string;
	hostType: DashboardSidebarWorkspaceHostType;
	accentColor: string | null;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface DashboardSidebarSection {
	id: string;
	projectId: string;
	name: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	color: string | null;
	workspaces: DashboardSidebarWorkspace[];
}

export type DashboardSidebarProjectChild =
	| {
			type: "workspace";
			workspace: DashboardSidebarWorkspace;
	  }
	| {
			type: "section";
			section: DashboardSidebarSection;
	  };

export interface DashboardSidebarProject {
	id: string;
	name: string;
	slug: string;
	githubRepositoryId: string | null;
	githubOwner: string | null;
	createdAt: Date;
	updatedAt: Date;
	isCollapsed: boolean;
	children: DashboardSidebarProjectChild[];
}
