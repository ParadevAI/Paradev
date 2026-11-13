import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { cloudWorkspaces } from "@superset/db/schema";
import {
	buildHostRoutingKey,
	SUPERSET_USER_ID_HEADER,
} from "@superset/shared/host-routing";
import { and, eq } from "drizzle-orm";
import { env } from "../../../../env";
import { sandboxHostSecretFor } from "../../../../lib/sandbox";
import {
	hostServiceMutation,
	relayMutation,
} from "../../../automation/relay-client";
import { wakeCloudWorkspace } from "../../../cloud-workspace/wake";

export type WorkspaceHost = {
	kind: "cloud" | "computer";
	mutation<TOutput>(
		procedure: string,
		input: object,
		timeoutMs?: number,
	): Promise<TOutput>;
};

/**
 * The host-service a workspace runs on, as the control plane reaches it: a
 * computer through the relay as the person who owns the chat, and a cloud
 * workspace's box directly with its host secret, woken first.
 */
export async function workspaceHost(args: {
	workspaceId: string;
	/** The computer's host; null for a cloud workspace. */
	hostId: string | null;
	organizationId: string;
	userId: string;
}): Promise<WorkspaceHost> {
	if (args.hostId) {
		const jwt = await mintUserJwt({
			userId: args.userId,
			organizationIds: [args.organizationId],
			scope: "chat-move",
			ttlSeconds: 600,
		});
		const options = {
			relayUrl: env.RELAY_URL,
			hostId: buildHostRoutingKey(args.organizationId, args.hostId),
			jwt,
		};
		return {
			kind: "computer",
			mutation: (procedure, input, timeoutMs) =>
				relayMutation({ ...options, timeoutMs }, procedure, input),
		};
	}

	const cloud = await db.query.cloudWorkspaces.findFirst({
		where: and(
			eq(cloudWorkspaces.id, args.workspaceId),
			eq(cloudWorkspaces.organizationId, args.organizationId),
		),
	});
	if (!cloud) throw new Error("The cloud workspace is gone");
	if (cloud.status !== "ready") {
		throw new Error(`The cloud workspace is ${cloud.status}`);
	}
	const { hostTarget } = await wakeCloudWorkspace(cloud);
	const headers = {
		authorization: `Bearer ${await sandboxHostSecretFor(cloud.id)}`,
		[SUPERSET_USER_ID_HEADER]: args.userId,
	};
	return {
		kind: "cloud",
		mutation: (procedure, input, timeoutMs) =>
			hostServiceMutation(
				{ baseUrl: hostTarget, headers, timeoutMs },
				procedure,
				input,
			),
	};
}
