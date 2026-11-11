import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useEffect, useRef, useState } from "react";
import { CommandTerminal } from "renderer/routes/_authenticated/components/CommandTerminal";
import { StepError } from "renderer/routes/_authenticated/components/StepError";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { findCompletedLogin } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/findCompletedLogin";
import { switchSignInCommand } from "renderer/routes/_authenticated/settings/usage/components/UsageView/utils/switchSignInCommand";
import {
	type UsageLogins,
	useHostUsageLogins,
} from "renderer/routes/_authenticated/settings/usage/hooks/useHostUsageLogins";
import { CODING_AGENT_NAMES, type CodingAgentId } from "../../constants";

interface AgentSignInTerminalProps {
	agent: CodingAgentId;
	onSignedIn: () => void;
	onRetry: () => void;
	onCancel: () => void;
}

/**
 * The agent's own login in a terminal, as Settings → Usage runs it. Paradev
 * never handles the credentials: it watches the host's logins for the result.
 */
export function AgentSignInTerminal({
	agent,
	onSignedIn,
	onRetry,
	onCancel,
}: AgentSignInTerminalProps) {
	const name = CODING_AGENT_NAMES[agent];
	const { activeHostUrl } = useLocalHostService();
	const [exitCode, setExitCode] = useState<number | null | undefined>(
		undefined,
	);
	const [found, setFound] = useState(false);
	const baselineRef = useRef<UsageLogins | null>(null);
	const logins = useHostUsageLogins(activeHostUrl, !found);
	const onSignedInRef = useRef(onSignedIn);
	onSignedInRef.current = onSignedIn;

	useEffect(() => {
		// Without a host to read logins from, the login's own exit code decides.
		if (!activeHostUrl && exitCode === 0 && !found) {
			setFound(true);
			onSignedInRef.current();
			return;
		}
		const current = logins.data;
		if (!current || found) return;
		if (!baselineRef.current) {
			baselineRef.current = current;
			return;
		}
		const login = findCompletedLogin({
			agent,
			credentialKind: "subscription",
			selection: null,
			baseline: baselineRef.current,
			current,
			commandSucceeded: exitCode === 0,
		});
		if (login) {
			setFound(true);
			onSignedInRef.current();
		}
	}, [activeHostUrl, agent, exitCode, found, logins.data]);

	if (exitCode !== undefined && exitCode !== 0) {
		return (
			<StepError
				message={<Trans>Sign-in didn't finish.</Trans>}
				onRetry={onRetry}
				fallback={
					<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
				}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				<Spinner className="size-3 shrink-0" />
				<span className="min-w-0 flex-1">
					<Trans>Sign in to {name} below. Your browser opens to finish.</Trans>
				</span>
				<Button type="button" size="sm" variant="ghost" onClick={onCancel}>
					<Trans>Cancel</Trans>
				</Button>
			</div>
			<div className="h-[200px] overflow-hidden rounded-md border p-2">
				{logins.data || !activeHostUrl ? (
					<CommandTerminal
						command={switchSignInCommand({
							agent,
							credentialKind: "subscription",
							selection: null,
						})}
						onExit={(code) => {
							setExitCode(code);
							void logins.refetch();
						}}
					/>
				) : null}
			</div>
		</div>
	);
}
