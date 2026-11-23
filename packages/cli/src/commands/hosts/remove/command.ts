import * as p from "@clack/prompts";
import { boolean, CLIError, positional, string } from "@superset/cli-framework";
import { getHostId } from "@superset/shared/host-info";
import { command } from "../../../lib/command";
import { resolveOrganizationFromContext } from "../../../lib/resolve-org";
import { shellQuote } from "../../../lib/shell-quote";
import { findRemoteHostKey } from "../../../lib/ssh-host-setup/host-key";
import { log } from "../../../lib/ssh-host-setup/log";
import { PROBE_SCRIPT, parseProbe } from "../../../lib/ssh-host-setup/probe";
import { uninstallServiceScript } from "../../../lib/ssh-host-setup/service";
import { SshSession } from "../../../lib/ssh-host-setup/ssh-session";

export default command({
	sandbox: false,
	description:
		"Undo `hosts add`: stop the host over SSH, remove its service, and revoke its API key",
	args: [
		positional("target")
			.required()
			.desc("SSH destination the host was added with"),
	],
	options: {
		org: string().desc(
			"Organization the host was added to (id, slug, or name); defaults to active",
		),
		yes: boolean().desc("Skip the confirmation prompt"),
	},
	run: async ({ ctx, args, options }) => {
		const target = args.target as string;
		const organization = await resolveOrganizationFromContext(
			ctx.api,
			ctx.config.organizationId,
			options.org,
		);
		p.intro(`paradev hosts remove ${target}`);
		const ssh = await SshSession.open(target);
		try {
			const probe = await ssh.run(PROBE_SCRIPT);
			if (probe.exitCode !== 0) {
				throw new CLIError(
					`Could not inspect ${target}`,
					probe.stderr.trim() || undefined,
				);
			}
			const facts = parseProbe(probe.stdout);
			if (!facts.machineId) {
				throw new CLIError(`Could not read the machine id of ${target}`);
			}
			const { hostId } = facts;
			if (hostId === getHostId()) {
				throw new CLIError(
					`${target} is this machine`,
					"Stop the host here with: paradev stop",
				);
			}

			if (!options.yes) {
				if (!process.stdin.isTTY) {
					throw new CLIError(
						`This stops the host on ${target}. Pass --yes to confirm.`,
					);
				}
				const confirmed = await p.confirm({
					message: `Stop the host on ${target} (${facts.hostname}) and sign it out? Its terminals end too.`,
				});
				if (p.isCancel(confirmed) || !confirmed) {
					return { data: { cancelled: true }, message: "Cancelled" };
				}
			}

			const keyId = await findRemoteHostKey(ctx.api, ssh, facts);
			const uninstall = await ssh.run(uninstallServiceScript());
			const removed = [...uninstall.stdout.matchAll(/removed=(\w+)/g)].map(
				(match) => match[1],
			);
			if (facts.bin) {
				const stop = await ssh.run(
					`${shellQuote(facts.bin)} stop --terminals --org ${shellQuote(organization.id)}`,
				);
				if (stop.exitCode !== 0) {
					throw new CLIError(
						`Stopping the host on ${target} failed`,
						stop.stderr.trim() || stop.stdout.trim(),
					);
				}
			}

			if (keyId && facts.bin) {
				await ctx.api.apiKey.revoke.mutate({ id: keyId });
				const logout = await ssh.run(`${shellQuote(facts.bin)} auth logout`);
				if (logout.exitCode !== 0) {
					throw new CLIError(
						`Revoked its API key but could not sign out ${target}`,
					);
				}
			}

			log.success(
				[
					removed.length > 0
						? `Removed the ${removed.join(" and ")} service`
						: "No service was installed",
					"stopped the host and its terminals",
					keyId
						? "revoked its API key and signed it out"
						: "found no API key from hosts add, so left its sign-in alone",
				].join("; "),
			);
			log.outro(
				"The CLI stays installed in ~/superset. The host stays listed, offline, until you delete it in Settings → Hosts.",
			);
			return {
				data: { hostId, removedServices: removed, revokedKeys: keyId ? 1 : 0 },
				message: `Removed the host on ${target}`,
			};
		} finally {
			await ssh.close();
		}
	},
});
