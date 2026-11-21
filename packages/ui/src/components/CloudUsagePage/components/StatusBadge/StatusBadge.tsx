"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { STATUS_BADGES } from "../../constants";
import type { WorkspaceRef } from "../../types";
import { ToneBadge } from "../ToneBadge";

export function StatusBadge({
	workspace,
}: {
	workspace: Pick<WorkspaceRef, "status" | "deleted">;
}) {
	const { i18n } = useLingui();
	if (workspace.deleted) {
		return (
			<ToneBadge tone="idle">
				<Trans context="cloud workspace status">Deleted</Trans>
			</ToneBadge>
		);
	}
	const { label, tone } = STATUS_BADGES[workspace.status];
	return <ToneBadge tone={tone}>{i18n._(label)}</ToneBadge>;
}
