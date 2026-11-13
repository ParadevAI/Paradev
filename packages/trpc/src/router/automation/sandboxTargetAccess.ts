import {
	buildHostRoutingKey,
	CLOUD_HOST_ID,
} from "@superset/shared/host-routing";
import { userError } from "../../i18n-error";
import type { SandboxCaller } from "../../lib/sandbox/api-credential";
import { decideCloudWorkspaceAccess } from "../host/cloud-workspace-access";

export async function assertSandboxTargetAccess(
	box: SandboxCaller | null,
	targetHostId: string | null,
	findHost: Parameters<typeof decideCloudWorkspaceAccess>[2],
): Promise<void> {
	if (!box || targetHostId === CLOUD_HOST_ID) return;
	const access = targetHostId
		? await decideCloudWorkspaceAccess(
				box,
				buildHostRoutingKey(box.organizationId, targetHostId),
				findHost,
			)
		: null;
	if (!access?.allowed) {
		throw userError({
			code: "FORBIDDEN",
			message: "No access to this host",
			i18nKey: "serverError.host.noAccessToThisHost",
		});
	}
}
