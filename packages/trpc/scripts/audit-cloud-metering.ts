import { parseArgs } from "node:util";

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			organization: { type: "string" },
			from: { type: "string" },
			until: { type: "string" },
			help: { type: "boolean", default: false },
		},
	});
	if (values.help) {
		console.log(
			"Usage: bun packages/trpc/scripts/audit-cloud-metering.ts --organization ORG_ID --from ISO_TIMESTAMP [--until ISO_TIMESTAMP]",
		);
		return;
	}
	const start = Date.parse(values.from ?? "");
	const end = values.until ? Date.parse(values.until) : Date.now();
	if (
		!values.organization ||
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		start >= end ||
		end > Date.now()
	) {
		throw new Error("Pass an organization and a valid past time window");
	}
	for (const value of [values.from, values.until]) {
		if (value && !/(Z|[+-]\d{2}:\d{2})$/.test(value))
			throw new Error("Timestamps must include a timezone");
	}
	const [{ db }, schema, query, autumn, sandbox, meter] = await Promise.all([
		import("@superset/db/client"),
		import("@superset/db/schema"),
		import("drizzle-orm"),
		import("@superset/auth/autumn"),
		import("../src/lib/sandbox"),
		import("../src/router/cloud-workspace/meter"),
	]);
	const rows = await db
		.select({
			boot: schema.cloudWorkspaceBoots,
			providerSandboxId: schema.cloudWorkspaces.providerSandboxId,
			userId: schema.cloudWorkspaces.createdByUserId,
		})
		.from(schema.cloudWorkspaceBoots)
		.leftJoin(
			schema.cloudWorkspaces,
			query.eq(
				schema.cloudWorkspaces.id,
				schema.cloudWorkspaceBoots.cloudWorkspaceId,
			),
		)
		.where(
			query.and(
				query.eq(
					schema.cloudWorkspaceBoots.organizationId,
					values.organization,
				),
				query.lte(schema.cloudWorkspaceBoots.startedAt, new Date(end)),
				query.or(
					query.isNull(schema.cloudWorkspaceBoots.stoppedAt),
					query.gte(schema.cloudWorkspaceBoots.stoppedAt, new Date(start)),
				),
			),
		);
	if (!rows.length) {
		console.log(
			JSON.stringify({
				recordedBoots: 0,
				note: "No metering records; this does not mean Vercel usage was zero.",
			}),
		);
		return;
	}
	const eventStart =
		Math.min(
			...rows.map(({ boot }) =>
				Math.min(boot.createdAt.getTime(), boot.startedAt.getTime()),
			),
		) -
		70 * 60_000;
	const events: Awaited<
		ReturnType<typeof autumn.autumnClient.events.list>
	>["list"] = [];
	let cursor: string | undefined;
	const cursors = new Set<string>();
	do {
		const page = await autumn.autumnClient.events.list({
			customerId: values.organization,
			featureId: ["box_gb_minutes", "active_cpu_minutes"],
			customRange: { start: eventStart, end: Date.now() },
			limit: 500,
			startCursor: cursor,
		});
		events.push(...page.list);
		cursor = page.nextCursor ?? undefined;
		if (cursor && cursors.has(cursor))
			throw new Error("Repeated Autumn event cursor");
		if (cursor) cursors.add(cursor);
	} while (cursor);
	const reports = [];
	for (const { boot, providerSandboxId, userId } of rows) {
		const found = providerSandboxId
			? await sandbox.findSandboxSession(
					providerSandboxId,
					boot.vercelSessionId,
				)
			: null;
		if (!found?.session || !boot.vercelSessionId) {
			reports.push({
				bootId: boot.id,
				userId,
				status: "provider-session-unavailable",
			});
			process.exitCode = 1;
			continue;
		}
		const session = found.session;
		const tagged = events.filter(
			(event) => event.properties.bootId === boot.id,
		);
		const memoryEvents = tagged.filter(
			(event) => event.featureId === "box_gb_minutes",
		);
		const net = memoryEvents.reduce((sum, event) => sum + event.value, 0);
		const reserved = boot.lockOpen
			? memoryEvents
					.filter((event) => event.properties.lockSeq === boot.lockSeq)
					.reduce((sum, event) => sum + event.value, 0)
			: 0;
		const completeAttribution =
			memoryEvents.length > 0 &&
			memoryEvents.every((event) => event.properties.meteringVersion === 1);
		const confirmed = completeAttribution ? net - reserved : null;
		const settledEnd = Math.min(
			boot.finalizedThrough?.getTime() ?? session.startedAt,
			session.endedAt ?? Date.now(),
		);
		const providerConfirmed = meter.gbMinutes({
			ms: settledEnd - session.startedAt,
			memoryMb: session.memoryMb,
		});
		const difference =
			confirmed === null ? null : confirmed - providerConfirmed;
		const fullySettled =
			session.endedAt !== null &&
			boot.stoppedAt !== null &&
			!boot.lockOpen &&
			settledEnd >= session.endedAt;
		const cpu = tagged
			.filter((event) => event.featureId === "active_cpu_minutes")
			.reduce((sum, event) => sum + event.value, 0);
		const providerCpu =
			session.activeCpuMs === null ? null : session.activeCpuMs / 60_000;
		if (
			fullySettled &&
			(difference === null ||
				Math.abs(difference) > 0.000001 ||
				(providerCpu !== null && Math.abs(cpu - providerCpu) > 0.000001))
		)
			process.exitCode = 1;
		reports.push({
			bootId: boot.id,
			userId,
			sessionId: session.id,
			fullySettled,
			attributionStatus: completeAttribution
				? "versioned"
				: "legacy-or-missing-events",
			vercelWindowGbMinutes: meter.gbMinutes({
				ms:
					Math.min(end, session.endedAt ?? end) -
					Math.max(start, session.startedAt),
				memoryMb: session.memoryMb,
			}),
			autumnFinalizedLifetimeGbMinutes: confirmed,
			autumnReservedGbMinutes: completeAttribution ? reserved : null,
			vercelFinalizedLifetimeGbMinutes: providerConfirmed,
			finalizedLifetimeDifferenceGbMinutes: difference,
			autumnCpuMinutes: cpu,
			vercelCpuMinutes: providerCpu,
		});
	}
	console.log(
		JSON.stringify(
			{
				window: {
					from: new Date(start).toISOString(),
					until: new Date(end).toISOString(),
				},
				coverage:
					"Recorded boots only; unmetered historical sessions and environment builds are not included.",
				unattributedMemoryEventValue: events
					.filter(
						(event) =>
							event.featureId === "box_gb_minutes" && !event.properties.bootId,
					)
					.reduce((sum, event) => sum + event.value, 0),
				note: "Vercel window usage is clipped runtime. Lifetime comparisons use full lock histories, not event posting dates. Holds and unsettled runtime are not consumed usage. Legacy missing attribution, adoption gaps, and event ingestion delay can produce discrepancies. No balances are changed.",
				reports,
			},
			null,
			2,
		),
	);
}

await main();
