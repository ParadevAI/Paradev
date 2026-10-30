import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { Ellipsis, FolderPlus, Gauge, Layers } from "lucide-react";
import {
	VscFolderOpened,
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
} from "react-icons/vsc";
import { useOpenNewWorkspaceForLocalProject } from "renderer/hooks/useOpenNewWorkspace";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { useDashboardNavigation } from "../../hooks/useDashboardNavigation";
import {
	RAIL_ICON_CLASS,
	RAIL_ICON_STROKE_WIDTH,
	railButtonClass,
} from "../RailButton";

export function RailMoreMenu() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const navigation = useDashboardNavigation();
	const openProjectWorkspace = useOpenNewWorkspaceForLocalProject();
	const openEmptyProject = useOpenEmptyProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
	const { data: isUsageInSidebarEnabled } =
		electronTrpc.settings.getShowUsageInSidebar.useQuery();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(t({ message: `Import failed: ${message}` }));
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error(t({ message: "Import failed" }), {
				description: t({
					message: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
				}),
				action: {
					label: t({ message: "Open Projects" }),
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	const handleImportFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			openProjectWorkspace(result.projectId);
			toast.success(t({ message: "Project imported and selected." }));
		}
	};

	return (
		<DropdownMenu>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "More" })}
							className={railButtonClass(navigation.isWorkspacesOpen)}
						>
							<Ellipsis
								className={RAIL_ICON_CLASS}
								strokeWidth={RAIL_ICON_STROKE_WIDTH}
							/>
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">
					<Trans>More</Trans>
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				side="right"
				align="start"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuItem onSelect={navigation.openWorkspaces}>
					<Layers className="size-4" />
					<Trans>Workspaces</Trans>
				</DropdownMenuItem>
				{isUsageInSidebarEnabled && (
					<DropdownMenuItem onSelect={navigation.openUsage}>
						<Gauge className="size-4" />
						<Trans>Usage</Trans>
					</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<FolderPlus className="size-4" />
						<Trans>Add project</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuPortal>
						<DropdownMenuSubContent>
							<DropdownMenuItem onSelect={handleImportFolder}>
								<VscFolderOpened className="size-4" />
								<Trans>Open project</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openNewProject()}>
								<VscGithubAlt className="size-4" />
								<Trans>Clone from URL</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openEmptyProject()}>
								<VscNewFolder className="size-4" />
								<Trans>Create new project</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={() => openTemplateGallery()}>
								<VscLayout className="size-4" />
								<Trans>Start from a template</Trans>
							</DropdownMenuItem>
						</DropdownMenuSubContent>
					</DropdownMenuPortal>
				</DropdownMenuSub>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
