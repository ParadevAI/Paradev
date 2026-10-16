import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { env } from "renderer/env.renderer";
import { track } from "renderer/lib/analytics";
import { useAppVersionHistoryStore } from "renderer/stores/app-version-history";
import { useReleaseNotesCardStore } from "renderer/stores/release-notes-card";
import type { SidebarCardEntry } from "../../types";
import { ReleaseNotesDialog } from "./components/ReleaseNotesDialog";
import { formatReleaseDate } from "./utils/formatReleaseDate";
import { releaseNotesQuery } from "./utils/releaseNotesQuery";
import {
	getCardRelease,
	getShippedReleases,
	sortReleases,
} from "./utils/selectReleaseNotes";

export function useReleaseNotesCard(): SidebarCardEntry | null {
	const { t } = useLingui();
	const previousVersion = useAppVersionHistoryStore((s) => s.previousVersion);
	const dismissedVersion = useReleaseNotesCardStore((s) => s.dismissedVersion);
	const storeDismiss = useReleaseNotesCardStore((s) => s.dismiss);
	const isPreviewingFlag = useReleaseNotesCardStore((s) => s.isPreviewing);
	const setPreviewing = useReleaseNotesCardStore((s) => s.setPreviewing);
	const isPreviewing = env.NODE_ENV === "development" && isPreviewingFlag;
	const [isDialogOpen, setDialogOpen] = useState(false);

	// Fails closed: no feed means no card.
	const { data } = useQuery(releaseNotesQuery);

	// A preview also shows releases newer than this build, so notes can be checked before they ship.
	const releases = useMemo(
		() =>
			isPreviewing
				? sortReleases(data?.releases ?? [])
				: getShippedReleases(data?.releases ?? [], window.App.appVersion),
		[data, isPreviewing],
	);
	const release = isPreviewing
		? (releases[0] ?? null)
		: getCardRelease(releases, { previousVersion, dismissedVersion });
	if (!release) return null;
	const version = release.version;
	const dismiss = () =>
		isPreviewing ? setPreviewing(false) : storeDismiss(version);

	return {
		id: `release-notes-${version}`,
		title: t({ message: `Superset ${version}` }),
		description: formatReleaseDate(release.date, { withYear: false }),
		media: release.image ? (
			<img
				src={release.image}
				alt=""
				className="aspect-[16/9] w-full object-cover"
			/>
		) : undefined,
		onClick: () => {
			track("release_notes_card_clicked", { version });
			setDialogOpen(true);
		},
		onDismiss: () => {
			track("release_notes_card_dismissed", { version });
			dismiss();
		},
		onShown: () => track("release_notes_card_shown", { version }),
		children: (
			<ReleaseNotesDialog
				open={isDialogOpen}
				releases={releases}
				onClose={() => {
					setDialogOpen(false);
					dismiss();
				}}
			/>
		),
	};
}
