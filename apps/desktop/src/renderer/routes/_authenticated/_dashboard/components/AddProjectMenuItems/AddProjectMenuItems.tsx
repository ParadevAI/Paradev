import { Trans } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import {
	VscGithubAlt,
	VscLayout,
	VscNewFolder,
	VscRepo,
} from "react-icons/vsc";
import {
	useOpenEmptyProjectModal,
	useOpenLocalProjectModal,
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";

/** The ways to add a project, as items for a dropdown menu. */
export function AddProjectMenuItems() {
	const openEmptyProject = useOpenEmptyProjectModal();
	const openLocalProject = useOpenLocalProjectModal();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();

	return (
		<>
			<DropdownMenuItem onSelect={() => openLocalProject()}>
				<VscRepo className="size-4" />
				<Trans>New project</Trans>
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
