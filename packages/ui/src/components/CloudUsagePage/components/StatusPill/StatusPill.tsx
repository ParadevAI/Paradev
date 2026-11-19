"use client";

import { useLingui } from "@lingui/react/macro";
import { STATUS_PILLS } from "../../constants";
import type { WorkspaceRef } from "../../types";
import { Pill } from "../Pill";

export function StatusPill({ status }: { status: WorkspaceRef["status"] }) {
	const { i18n } = useLingui();
	const { label, tone } = STATUS_PILLS[status];
	return <Pill tone={tone}>{i18n._(label)}</Pill>;
}
