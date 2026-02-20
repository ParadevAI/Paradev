import { AgentManager, type AgentManagerConfig } from "./agent-manager";

export interface ChatServiceHostConfig {
	deviceId: string;
	electricUrl: string;
	apiUrl: string;
}

export class ChatService {
	private agentManager: AgentManager | null = null;
	private hostConfig: ChatServiceHostConfig;

	constructor(hostConfig: ChatServiceHostConfig) {
		this.hostConfig = hostConfig;
	}

	async start(options: {
		organizationId: string;
		authToken: string;
	}): Promise<void> {
		const config: AgentManagerConfig = {
			deviceId: this.hostConfig.deviceId,
			organizationId: options.organizationId,
			authToken: options.authToken,
			electricUrl: this.hostConfig.electricUrl,
			apiUrl: this.hostConfig.apiUrl,
		};

		if (this.agentManager) {
			await this.agentManager.restart({
				organizationId: options.organizationId,
				deviceId: this.hostConfig.deviceId,
				authToken: options.authToken,
			});
		} else {
			this.agentManager = new AgentManager(config);
			await this.agentManager.start();
		}
	}

	stop(): void {
		if (this.agentManager) {
			this.agentManager.stop();
			this.agentManager = null;
		}
	}

	hasWatcher(sessionId: string): boolean {
		return this.agentManager?.hasWatcher(sessionId) ?? false;
	}

	ensureWatcher(sessionId: string): void {
		this.agentManager?.ensureWatcher(sessionId);
	}
}
