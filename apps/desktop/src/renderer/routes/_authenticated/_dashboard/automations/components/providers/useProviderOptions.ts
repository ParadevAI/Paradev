import { useMemo } from "react";
import { useGithubOptions } from "./github/useGithubOptions";
import { useGoogleOptions } from "./google/useGoogleOptions";
import { useLinearOptions } from "./linear/useLinearOptions";
import { useTeamsOptions } from "./microsoftTeams/useTeamsOptions";
import { useNotionOptions } from "./notion/useNotionOptions";
import { useSentryOptions } from "./sentry/useSentryOptions";
import { useSlackOptions } from "./slack/useSlackOptions";
import type { ProviderOptions } from "./types";

/**
 * Every provider's pickable values, merged into one map for the editor.
 *
 * Hooks cannot be called from a registry loop, so each provider's hook is
 * called here by name. Adding a provider with options means adding its hook to
 * this list. Each hook returns its own top-level key (`{ github: {...} }`), so
 * the merge is a spread and cannot clobber.
 */
export function useProviderOptions(organizationId: string): ProviderOptions {
	const github = useGithubOptions(organizationId);
	const sentry = useSentryOptions(organizationId);
	const linear = useLinearOptions(organizationId);
	const notion = useNotionOptions(organizationId);
	const slack = useSlackOptions(organizationId);
	const teams = useTeamsOptions(organizationId);
	const google = useGoogleOptions(organizationId);
	return useMemo(
		() => ({
			...github,
			...sentry,
			...linear,
			...notion,
			...slack,
			...teams,
			...google,
		}),
		[github, sentry, linear, notion, slack, teams, google],
	);
}
