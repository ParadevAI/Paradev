import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	keepOpenForToasts,
	keepOpenWhileInviting,
	ShareAccess,
	type ShareGranteeRef,
} from "@superset/ui/share-access";
import { useState } from "react";
import { LuBuilding2, LuLock } from "react-icons/lu";
import { env } from "renderer/env.renderer";
import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useShareDirectory } from "../../hooks/useShareDirectory";

interface CloudWorkspaceShareButtonProps {
	workspaceId: string;
	owner: CloudWorkspaceRow["createdBy"];
	visibility: CloudWorkspaceRow["visibility"];
	canEdit: boolean;
	onSetVisibility: (
		visibility: CloudWorkspaceRow["visibility"],
	) => Promise<unknown>;
}

export function CloudWorkspaceShareButton({
	workspaceId,
	owner,
	visibility,
	canEdit,
	onSetVisibility,
}: CloudWorkspaceShareButtonProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	const { copyToClipboard } = useCopyToClipboard();
	const share = useShareDirectory();
	const utils = cloudTrpc.useUtils();
	const sharing = cloudTrpc.cloudWorkspace.sharing.get.useQuery(
		{ id: workspaceId },
		{ enabled: open },
	);
	const refresh = () => {
		void utils.cloudWorkspace.sharing.get.invalidate({ id: workspaceId });
		void utils.cloudWorkspace.activity.invalidate({ id: workspaceId });
	};
	const add = cloudTrpc.cloudWorkspace.sharing.add.useMutation({
		onSuccess: refresh,
	});
	const remove = cloudTrpc.cloudWorkspace.sharing.remove.useMutation({
		onSuccess: refresh,
	});

	const linkUrl = `${env.NEXT_PUBLIC_WEB_URL}/workspaces/${workspaceId}`;
	const grantees = sharing.data?.grantees ?? [];
	const ownerPerson = owner
		? {
				userId: owner.userId,
				name: owner.name,
				email: sharing.data?.owner?.email ?? "",
				image: owner.image,
			}
		: null;

	const icon =
		visibility === "just_me" ? (
			<LuLock className="size-3.5" />
		) : (
			<LuBuilding2 className="size-3.5" />
		);

	const organizationName = share.organizationName;
	const fullAccess = {
		id: "full",
		label: t({ message: "Full access" }),
		description: t({ message: "Open terminals and prompt agents" }),
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button size="xs" variant="ghost" className="gap-1.5">
					{icon}
					<Trans>Share</Trans>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-[32rem] p-0"
				onInteractOutside={keepOpenForToasts}
				onEscapeKeyDown={keepOpenWhileInviting}
			>
				<ShareAccess
					title={<Trans>Share workspace</Trans>}
					owner={ownerPerson}
					currentUserId={share.currentUserId}
					grantees={grantees}
					canManage={sharing.data?.canManage ?? canEdit}
					roles={[fullAccess]}
					defaultRole="full"
					roleNote={fullAccess.label}
					directory={share.directory}
					organizationName={share.organizationName}
					organizationLogo={share.organizationLogo}
					inviteNew={share.inviteNew}
					onUpgrade={share.onUpgrade}
					onCopyLink={() => copyToClipboard(linkUrl)}
					onAdd={async ({ grantees: picked, emails }) => {
						const invitationIds = await share.inviteEmails(emails);
						await add.mutateAsync({
							id: workspaceId,
							grantees: [
								...picked,
								...invitationIds.map(
									(invitationId): ShareGranteeRef => ({
										kind: "invitation",
										invitationId,
									}),
								),
							],
						});
					}}
					onRemove={async (grantee) => {
						await remove.mutateAsync({ id: workspaceId, grantee });
					}}
					onResendInvite={async (invitationId) => {
						const invite = grantees.find(
							(g) => g.kind === "invitation" && g.invitationId === invitationId,
						);
						if (invite?.kind === "invitation") {
							await share.inviteEmails([invite.email]);
						}
					}}
					general={{
						value: visibility,
						options: [
							{
								value: "just_me",
								label: t({ message: "Only people invited" }),
								icon: <LuLock className="size-3.5 text-muted-foreground" />,
							},
							{
								value: "org",
								label: t({ message: `Anyone in ${organizationName}` }),
								icon: (
									<LuBuilding2 className="size-3.5 text-muted-foreground" />
								),
								organization: true,
							},
						],
						onChange: async (next) => {
							await onSetVisibility(next as CloudWorkspaceRow["visibility"]);
							if (next === "org") await copyToClipboard(linkUrl);
						},
						confirm: (_from, to) =>
							to === "just_me"
								? {
										title: t({ message: "Limit to people invited?" }),
										description: t({
											message: `Anyone in ${share.organizationName} who isn't listed here loses access, including anyone who has it open now.`,
										}),
										actionLabel: t({ message: "Limit access" }),
									}
								: null,
						role: {
							value: "full",
							options: [fullAccess],
							appliesTo: ["org"],
							onChange: async () => {},
						},
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
