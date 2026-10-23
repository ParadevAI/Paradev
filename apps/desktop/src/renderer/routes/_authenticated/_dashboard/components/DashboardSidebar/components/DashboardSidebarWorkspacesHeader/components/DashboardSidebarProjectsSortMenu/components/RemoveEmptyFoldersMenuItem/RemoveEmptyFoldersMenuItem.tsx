import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { DropdownMenuItem } from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { LuFolderX } from "react-icons/lu";
import {
	type RemoveEmptySidebarFoldersResult,
	type SkippedSidebarFolder,
	useEmptySidebarFolders,
} from "renderer/routes/_authenticated/hooks/useEmptySidebarFolders";

/**
 * Removes stored folders whose tag no workspace carries. Mounted only while
 * the menu is open, so the sidebar does not track the count otherwise.
 */
export function RemoveEmptyFoldersMenuItem() {
	const { t } = useLingui();
	const { emptyFolders, unverifiedFolders, removeEmptyFolders } =
		useEmptySidebarFolders();
	const emptyCount = emptyFolders.length;

	const describeSkipped = (skippedFolders: readonly SkippedSidebarFolder[]) => {
		const skipped = skippedFolders.length;
		if (skipped === 0) return undefined;
		if (
			skippedFolders.every(({ reason }) => reason === "settingHostsUnknown")
		) {
			return t({
				message: plural(skipped, {
					one: "Skipped # folder: not every host that keeps its settings is known yet.",
					other:
						"Skipped # folders: not every host that keeps their settings is known yet.",
				}),
			});
		}
		return t({
			message: plural(skipped, {
				one: "Skipped # folder: a host or the cloud has not answered yet.",
				other: "Skipped # folders: a host or the cloud has not answered yet.",
			}),
		});
	};

	const report = ({
		removed,
		skipped,
		failed,
	}: RemoveEmptySidebarFoldersResult) => {
		if (failed.length > 0) {
			toast.error(
				t({
					message: plural(failed.length, {
						one: "Could not remove # folder",
						other: "Could not remove # folders",
					}),
				}),
				{ description: failed[0]?.error },
			);
		}
		if (removed.length > 0) {
			toast.success(
				t({
					message: plural(removed.length, {
						one: "Removed # empty folder",
						other: "Removed # empty folders",
					}),
				}),
				{ description: describeSkipped(skipped) },
			);
			return;
		}
		if (failed.length === 0) {
			toast(t({ message: "No folders removed" }), {
				description: describeSkipped(skipped),
			});
		}
	};

	return (
		<DropdownMenuItem
			disabled={emptyCount === 0 && unverifiedFolders.length === 0}
			onSelect={() => {
				void removeEmptyFolders().then(report, (error: unknown) => {
					console.error("[sidebar] remove empty folders failed:", error);
				});
			}}
		>
			<LuFolderX className="size-4" />
			{emptyCount > 0
				? t({
						message: plural(emptyCount, {
							one: "Remove # empty folder",
							other: "Remove # empty folders",
						}),
					})
				: unverifiedFolders.length > 0
					? t({ message: "Remove empty folders" })
					: t({ message: "No empty folders" })}
		</DropdownMenuItem>
	);
}
