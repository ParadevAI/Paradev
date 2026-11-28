let telemetryEnabled = window.App?.telemetryEnabled !== false;

export function isTelemetryEnabled(): boolean {
	return telemetryEnabled;
}

export function setTelemetryEnabled(enabled: boolean): void {
	telemetryEnabled = enabled;
}
