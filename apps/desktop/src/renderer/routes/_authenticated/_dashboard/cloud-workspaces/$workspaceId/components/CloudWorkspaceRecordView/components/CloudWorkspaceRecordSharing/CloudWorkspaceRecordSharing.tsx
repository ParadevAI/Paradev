import { useLingui } from "@lingui/react/macro";
import type { PresenceVisitor } from "@superset/shared/page-presence";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { CloudWorkspaceShareButton } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceShareButton";
import { PresenceStack } from "renderer/routes/_authenticated/_dashboard/components/PresenceStack";

interface CloudWorkspaceRecordSharingProps {
	workspaceId: string;
	people: PresenceVisitor[];
	owner: CloudWorkspaceRow["createdBy"];
	visibility: CloudWorkspaceRow["visibility"];
	canEditSharing: boolean;
	viewerId: string | undefined;
	now: Date;
	onOpenPerson: (userId: string) => void;
	onSetVisibility: (
		visibility: CloudWorkspaceRow["visibility"],
	) => Promise<unknown>;
}

export function CloudWorkspaceRecordSharing({
	workspaceId,
	people,
	owner,
	visibility,
	canEditSharing,
	viewerId,
	now,
	onOpenPerson,
	onSetVisibility,
}: CloudWorkspaceRecordSharingProps) {
	const { t } = useLingui();
	return (
		<div className="flex shrink-0 items-center gap-3">
			<CloudWorkspaceShareButton
				workspaceId={workspaceId}
				owner={owner}
				visibility={visibility}
				canEdit={canEditSharing}
				onSetVisibility={onSetVisibility}
			/>
			<PresenceStack
				people={people}
				viewerId={viewerId}
				now={now}
				overflowLabel={t({
					message: "Show everyone who opened this workspace",
				})}
				onOpenPerson={onOpenPerson}
			/>
		</div>
	);
}
