/**
 * Everything the box needs to be one workspace, assembled in one place so a
 * create, a wake and a restart after promote all hand the box the same thing:
 * its identity file, the credential rules for the firewall, the managed
 * environment to push after boot, and the host secret for the boot command.
 */
import { db } from "@superset/db/client";
import { type cloudWorkspaces, users } from "@superset/db/schema";
import {
	GOLDEN_BOX_VCPUS,
	LEGACY_MACHINE_SIZE,
} from "@superset/shared/billing";
import { BRAND } from "@superset/shared/brand";
import {
	type CloudAgentLaunch,
	cloudAgentLaunchToEnv,
} from "@superset/shared/cloud-agent-launch";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	SANDBOX_CONTRACT_VERSION,
	SANDBOX_PATHS,
	type SandboxIdentity,
	type SandboxRepository,
} from "@superset/shared/sandbox/contract";
import { eq } from "drizzle-orm";
import { env } from "../../env";
import { resolveAgentSignIns } from "../../router/agent-credential";
import { accessTokenExpiresAt } from "../../router/agent-credential/utils/chatgpt";
import { resolveEnvironment } from "../../router/environment/resolve-environment";
import { posthog } from "../analytics";
import { resolveMachineSize } from "../billing/plan";
import { organizationFlagEnabled } from "../feature-flags";
import { githubUserConnectionFor, githubUserTokenFor } from "../github-user";
import { sandboxHostSecretFor } from "./access";
import { agentSignInKinds } from "./agent-sign-in-kinds";
import { deriveSandboxCredentials, gitAuthorFor } from "./credentials";
import {
	allowedPlugins,
	creatorPlugins,
	environmentMcpAllowlist,
} from "./plugins";
import { environmentHooks } from "./repo-hooks";
import {
	installationTokenFor,
	toSandboxRepositories,
	workspaceRepositories,
} from "./repositories";
import type { SandboxClaim, SandboxEnvironment } from "./vercel";

type CloudWorkspaceRow = typeof cloudWorkspaces.$inferSelect;

/** Commits by a workspace nobody created, such as an automation's. */
const SUPERSET_GIT_AUTHOR = { name: BRAND.NAME, email: "noreply@superset.sh" };

/** A size the org no longer offers falls back to its default at the next start. */
async function boxVcpus(row: CloudWorkspaceRow): Promise<number> {
	const size =
		(await resolveMachineSize(
			row.organizationId,
			row.machineSize ?? LEGACY_MACHINE_SIZE,
		)) ?? (await resolveMachineSize(row.organizationId, null));
	return size?.vcpus ?? GOLDEN_BOX_VCPUS;
}

export async function buildSandboxClaim(args: {
	row: CloudWorkspaceRow;
	launch?: CloudAgentLaunch;
	/**
	 * Read the environment's hooks too. Only a create needs them (ports are
	 * fixed once the box exists), and without an environment config it costs
	 * a GitHub request.
	 */
	withRepoHooks?: boolean;
}): Promise<{
	claim: SandboxClaim;
	environment: SandboxEnvironment;
	repositories: SandboxRepository[];
	agentCredentialDigest: string;
	/** When the first token in the rules expires; null when none does. */
	rulesExpireAt: Date | null;
}> {
	const [environment, signIns, boxLogs] = await Promise.all([
		resolveEnvironment(args.row.environmentId, args.row.organizationId),
		args.row.createdByUserId
			? resolveAgentSignIns({ userId: args.row.createdByUserId })
			: Promise.resolve({ env: {}, codexChatgpt: null }),
		env.SENTRY_DSN_SANDBOX
			? organizationFlagEnabled(
					posthog,
					FEATURE_FLAGS.SANDBOX_BOX_LOGS,
					args.row.organizationId,
				)
			: false,
	]);
	if (!environment) throw new Error("Environment not found");
	const checkouts = await workspaceRepositories({
		cloudWorkspaceId: args.row.id,
		primaryRepositoryId: environment.primaryRepositoryId,
		primaryBranch: args.row.baseBranch,
		workingBranch: args.row.branch,
	});
	const creator = args.row.createdByUserId;
	const [userToken, githubAccount, creatorUser] = creator
		? await Promise.all([
				githubUserTokenFor(creator),
				githubUserConnectionFor(creator),
				db.query.users.findFirst({
					where: eq(users.id, creator),
					columns: { name: true, email: true },
				}),
			])
		: [null, null, undefined];
	const plugins = allowedPlugins(
		await creatorPlugins(creator, args.row.organizationId),
		environmentMcpAllowlist(environment.config),
	);
	// The creator's own token when they have connected GitHub: pushes and pull
	// requests are theirs. The App's installation token otherwise.
	const installation = userToken
		? null
		: await installationTokenFor(checkouts.map((entry) => entry.repository));
	const token = userToken ?? installation?.token ?? null;
	const expiries = [
		userToken ? githubAccount?.accessTokenExpiresAt : installation?.expiresAt,
		signIns.codexChatgpt
			? accessTokenExpiresAt(signIns.codexChatgpt.accessToken)
			: null,
	].filter((at): at is Date => at instanceof Date);
	const primaryCheckout = checkouts[0];
	const repoHooks =
		args.withRepoHooks && primaryCheckout
			? await environmentHooks({
					config: environment.config,
					repo: primaryCheckout.repository,
					branch: primaryCheckout.baseBranch,
					token,
				})
			: null;
	const repositories = toSandboxRepositories(checkouts);

	const identity: SandboxIdentity = {
		SUPERSET_SANDBOX_CONTRACT: String(SANDBOX_CONTRACT_VERSION) as "1",
		SUPERSET_API_URL: env.NEXT_PUBLIC_API_URL,
		SUPERSET_SANDBOX_WORKSPACE_ID: args.row.id,
		SUPERSET_SANDBOX_ORGANIZATION_ID: args.row.organizationId,
		...(creator ? { SUPERSET_SANDBOX_CREATOR_USER_ID: creator } : {}),
		SUPERSET_SANDBOX_REPOSITORIES: JSON.stringify(repositories),
		SUPERSET_SANDBOX_PLUGINS: JSON.stringify(plugins),
		SUPERSET_SANDBOX_IMAGE_TAG: environment.sourceRef,
		SUPERSET_SANDBOX_PROVIDER: args.row.provider,
		SUPERSET_BUNDLE_SHA: environment.bundleSha,
		...(env.SENTRY_DSN_SANDBOX
			? {
					HOST_SERVICE_SENTRY_DSN: env.SENTRY_DSN_SANDBOX,
					HOST_SERVICE_SENTRY_ENVIRONMENT:
						env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
				}
			: {}),
		...(boxLogs ? { SUPERSET_SANDBOX_BOX_LOGS: "1" as const } : {}),
		...(cloudAgentLaunchToEnv(args.launch) as Partial<SandboxIdentity>),
	};
	const { networkPolicy, managedEnv, files } = await deriveSandboxCredentials({
		workspaceId: args.row.id,
		environmentEnv: environment.envs,
		userAgentEnv: signIns.env,
		codexChatgpt: signIns.codexChatgpt,
		githubToken: token,
		gitAuthor: gitAuthorFor({
			github: githubAccount
				? {
						id: githubAccount.githubUserId,
						login: githubAccount.login,
						name: githubAccount.name,
					}
				: null,
			user: creatorUser ?? SUPERSET_GIT_AUTHOR,
		}),
	});
	return {
		claim: {
			identity,
			hostSecret: await sandboxHostSecretFor(args.row.id),
			managedEnv,
			networkPolicy,
			files: [
				...files,
				{
					path: SANDBOX_PATHS.environmentConfig,
					content: environment.config ?? "",
				},
			],
			ports: repoHooks?.ports,
			vcpus: await boxVcpus(args.row),
			agentTools: await organizationFlagEnabled(
				posthog,
				FEATURE_FLAGS.SANDBOX_AGENT_TOOLS_DRIVE,
				args.row.organizationId,
			),
		},
		environment: {
			sourceKind: environment.sourceKind,
			sourceRef: environment.sourceRef,
			region: environment.region,
		},
		repositories,
		agentCredentialDigest: agentSignInKinds(signIns),
		rulesExpireAt: expiries.length
			? new Date(Math.min(...expiries.map((at) => at.getTime())))
			: null,
	};
}
