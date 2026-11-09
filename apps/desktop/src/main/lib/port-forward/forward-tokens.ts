/** Which credential a forward presents: the relay token, or a gate host's own ticket. */
export class ForwardTokens {
	private relayToken: string | null = null;
	private readonly hostTokens = new Map<string, string>();
	// Gate hosts never get the relay token, even when their ticket is missing.
	private readonly gateHosts = new Set<string>();

	setRelayToken(token: string | null): void {
		this.relayToken = token;
	}

	getRelayToken(): string | null {
		return this.relayToken;
	}

	setHostToken(hostUrl: string, token: string | null): void {
		this.gateHosts.add(hostUrl);
		if (token) this.hostTokens.set(hostUrl, token);
		else this.hostTokens.delete(hostUrl);
	}

	markGateHost(hostUrl: string): void {
		this.gateHosts.add(hostUrl);
	}

	tokenFor(hostUrl: string): string | null {
		return this.gateHosts.has(hostUrl)
			? (this.hostTokens.get(hostUrl) ?? null)
			: this.relayToken;
	}

	/** Sign-out: no credential of the person who left survives. */
	clearCredentials(): void {
		this.relayToken = null;
		this.hostTokens.clear();
	}
}
