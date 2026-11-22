export type PendingCloudLaunchReport =
	| {
			kind: "chat";
			sessionId: string;
			terminalId: string;
			automationRunId: string;
	  }
	| { kind: "terminal"; terminalId: string; automationRunId: string };

const PENDING_PREFIX = "pending-report ";

export function readPendingLaunchReport(
	marker: string,
): PendingCloudLaunchReport | null {
	const line = marker
		.split("\n")
		.find((entry) => entry.startsWith(PENDING_PREFIX));
	if (!line) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(line.slice(PENDING_PREFIX.length));
	} catch {
		return null;
	}
	if (!parsed || typeof parsed !== "object") return null;
	const report = parsed as Partial<PendingCloudLaunchReport>;
	if (typeof report.automationRunId !== "string" || !report.automationRunId) {
		return null;
	}
	if (report.kind === "terminal" && typeof report.terminalId === "string") {
		return {
			kind: "terminal",
			terminalId: report.terminalId,
			automationRunId: report.automationRunId,
		};
	}
	if (
		report.kind === "chat" &&
		typeof report.sessionId === "string" &&
		typeof report.terminalId === "string"
	) {
		return {
			kind: "chat",
			sessionId: report.sessionId,
			terminalId: report.terminalId,
			automationRunId: report.automationRunId,
		};
	}
	return null;
}

export function withPendingLaunchReport(
	marker: string,
	report: PendingCloudLaunchReport,
): string {
	const claimed = marker
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith(PENDING_PREFIX));
	return `${claimed.join("\n")}\n${PENDING_PREFIX}${JSON.stringify(report)}\n`;
}

export function withoutPendingLaunchReport(marker: string): string {
	const claimed = marker
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith(PENDING_PREFIX));
	return claimed.length > 0 ? `${claimed.join("\n")}\n` : "";
}
