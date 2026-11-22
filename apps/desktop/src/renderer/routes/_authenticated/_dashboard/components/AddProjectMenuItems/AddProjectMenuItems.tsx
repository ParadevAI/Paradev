import { Trans, useLingui } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import {
	VscFolderOpened,
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
} from "react-icons/vsc";
import { useOpenNewWorkspaceForLocalProject } from "renderer/hooks/useOpenNewWorkspace";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import {
	useOpenEmptyProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";

/** The ways to add a project, as items for a dropdown menu. */
export function AddProjectMenuItems() {
	const { t } = useLingui();
	const navigate = useNavigate();
	const openProjectWorkspace = useOpenNewWorkspaceForLocalProject();
	const openEmptyProject = useOpenEmptyProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();
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
		<>
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
		</>
	);
}
