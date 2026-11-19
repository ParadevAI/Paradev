"use client";

import { useLingui } from "@lingui/react/macro";
import { STATUS_BADGES } from "../../constants";
import type { WorkspaceRef } from "../../types";
import { ToneBadge } from "../ToneBadge";

export function StatusBadge({ status }: { status: WorkspaceRef["status"] }) {
	const { i18n } = useLingui();
	const { label, tone } = STATUS_BADGES[status];
	return <ToneBadge tone={tone}>{i18n._(label)}</ToneBadge>;
}
