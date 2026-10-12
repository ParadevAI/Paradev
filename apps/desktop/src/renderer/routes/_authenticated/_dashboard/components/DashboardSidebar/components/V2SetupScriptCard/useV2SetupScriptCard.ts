import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { SidebarCardEntry } from "renderer/components/SidebarCardSlot";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useV2SetupCardDismissalsStore } from "renderer/stores/v2-setup-card-dismissals";

export function useV2SetupScriptCard({
	hostUrl,
	projectId,
	projectName,
}: {
	hostUrl: string | null;
	projectId: string | null;
	projectName: string | null;
}): SidebarCardEntry | null {
	const { t } = useLingui();
	const navigate = useNavigate();
	const isDismissed = useV2SetupCardDismissalsStore((s) =>
		projectId ? s.isDismissed(projectId) : false,
	);
	const dismiss = useV2SetupCardDismissalsStore((s) => s.dismiss);

	const { data: shouldShow } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () => {
			if (!hostUrl || !projectId) throw new Error("no active host or project");
			return getHostServiceClientByUrl(
				hostUrl,
			).config.shouldShowSetupCard.query({ projectId });
		},
		enabled: !!hostUrl && !!projectId,
		refetchOnWindowFocus: true,
	});

	if (!hostUrl || !projectId || !projectName || isDismissed || !shouldShow) {
		return null;
	}

	return {
		id: `setup-script:${projectId}`,
		badge: t({
			message: "Setup",
		}),
		title: t({
			message: "Lifecycle scripts",
		}),
		description: t({
			message: `Automate workspace setup for ${projectName}`,
		}),
		actionLabel: t({
			message: "Configure",
		}),
		onAction: () => {
			void navigate({
				to: "/settings/projects/$projectId",
				params: { projectId },
				search: { focus: "scripts" },
			});
		},
		onDismiss: () => dismiss(projectId),
	};
}
