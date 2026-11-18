import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { FilesSettings } from "./components/FilesSettings";

export const Route = createFileRoute("/_authenticated/settings/files/")({
	component: FilesSettingsPage,
});

function FilesSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "files",
				searchQuery,
			}),
		[searchQuery],
	);

	return <FilesSettings visibleItems={visibleItems} />;
}
