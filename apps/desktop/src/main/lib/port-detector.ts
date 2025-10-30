import { exec } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import type { IPty } from "node-pty";

const execAsync = promisify(exec);

interface DetectedPort {
	port: number;
	service?: string;
	terminalId: string;
	detectedAt: string;
}

interface MonitoredTerminal {
	terminalId: string;
	worktreeId: string;
	ptyProcess: IPty;
	cwd?: string;
	intervalId?: NodeJS.Timeout;
	lastDetectedPorts: Set<number>;
}

export class PortDetector extends EventEmitter {
	private static instance: PortDetector;
	private monitoredTerminals: Map<string, MonitoredTerminal> = new Map();
	private worktreePortsCache: Map<string, DetectedPort[]> = new Map();
	private readonly POLL_INTERVAL = 2000; // 2 seconds

	private constructor() {
		super();
	}

	static getInstance(): PortDetector {
		if (!PortDetector.instance) {
			PortDetector.instance = new PortDetector();
		}
		return PortDetector.instance;
	}

	/**
	 * Start monitoring a terminal for port detection
	 */
	startMonitoring(
		terminalId: string,
		worktreeId: string,
		ptyProcess: IPty,
		cwd?: string,
	): void {
		// Stop existing monitoring if any
		this.stopMonitoring(terminalId);

		const monitored: MonitoredTerminal = {
			terminalId,
			worktreeId,
			ptyProcess,
			cwd,
			lastDetectedPorts: new Set(),
		};

		this.monitoredTerminals.set(terminalId, monitored);

		// Start polling
		monitored.intervalId = setInterval(() => {
			this.pollTerminalPorts(terminalId).catch((error) => {
				console.error(
					`Error polling ports for terminal ${terminalId}:`,
					error,
				);
			});
		}, this.POLL_INTERVAL);

		// Also do an immediate check
		this.pollTerminalPorts(terminalId).catch((error) => {
			console.error(`Error in initial port check for ${terminalId}:`, error);
		});

		console.log(
			`[PortDetector] Started monitoring terminal ${terminalId} for worktree ${worktreeId}`,
		);
	}

	/**
	 * Stop monitoring a terminal
	 */
	stopMonitoring(terminalId: string): void {
		const monitored = this.monitoredTerminals.get(terminalId);
		if (!monitored) return;

		if (monitored.intervalId) {
			clearInterval(monitored.intervalId);
		}

		// Emit port-closed events for all ports that were detected
		for (const port of monitored.lastDetectedPorts) {
			this.emit("port-closed", {
				terminalId,
				worktreeId: monitored.worktreeId,
				port,
			});
		}

		this.monitoredTerminals.delete(terminalId);

		// Update cache
		this.updateWorktreePortsCache(monitored.worktreeId);

		console.log(`[PortDetector] Stopped monitoring terminal ${terminalId}`);
	}

	/**
	 * Poll a terminal for listening ports
	 */
	private async pollTerminalPorts(terminalId: string): Promise<void> {
		const monitored = this.monitoredTerminals.get(terminalId);
		if (!monitored) return;

		const pid = monitored.ptyProcess.pid;
		const ports = await this.getPortsForPID(pid);

		// Compare with last detected ports
		const currentPorts = new Set(ports);
		const previousPorts = monitored.lastDetectedPorts;

		// Find newly detected ports
		const newPorts = ports.filter((port) => !previousPorts.has(port));

		// Find closed ports
		const closedPorts = Array.from(previousPorts).filter(
			(port) => !currentPorts.has(port),
		);

		// Emit events for new ports
		for (const port of newPorts) {
			const service = this.detectServiceName(monitored.cwd);
			const detectedPort: DetectedPort = {
				port,
				service,
				terminalId,
				detectedAt: new Date().toISOString(),
			};

			this.emit("port-detected", {
				...detectedPort,
				worktreeId: monitored.worktreeId,
			});

			console.log(
				`[PortDetector] Detected port ${port}${service ? ` (${service})` : ""} in terminal ${terminalId}`,
			);
		}

		// Emit events for closed ports
		for (const port of closedPorts) {
			this.emit("port-closed", {
				terminalId,
				worktreeId: monitored.worktreeId,
				port,
			});

			console.log(
				`[PortDetector] Port ${port} closed in terminal ${terminalId}`,
			);
		}

		// Update last detected ports
		monitored.lastDetectedPorts = currentPorts;

		// Update cache
		this.updateWorktreePortsCache(monitored.worktreeId);
	}

	/**
	 * Get all listening ports for a PID (including child processes)
	 */
	private async getPortsForPID(pid: number): Promise<number[]> {
		try {
			// Use lsof to find all listening TCP ports for this PID
			// -Pan: Disables conversion of port numbers to names, shows network addresses
			// -p: Filter by PID
			// -i4TCP: IPv4 TCP connections only
			// -sTCP:LISTEN: Only show listening sockets
			const { stdout } = await execAsync(
				`lsof -Pan -p ${pid} -i4TCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | sed 's/.*://' || true`,
			);

			const ports = stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((p) => Number.parseInt(p, 10))
				.filter((p) => !Number.isNaN(p) && p > 0 && p <= 65535);

			return [...new Set(ports)]; // Deduplicate
		} catch (error) {
			// lsof may fail if process has no listening ports, which is expected
			return [];
		}
	}

	/**
	 * Detect service name from terminal working directory
	 */
	private detectServiceName(cwd?: string): string | undefined {
		if (!cwd) return undefined;

		// Extract service name from path
		// Example: ~/.superset/worktrees/superset/main/apps/website -> "website"
		// Example: /path/to/repo/apps/docs -> "docs"

		const parts = cwd.split("/");

		// Check for common monorepo patterns
		const appsIndex = parts.lastIndexOf("apps");
		if (appsIndex !== -1 && appsIndex < parts.length - 1) {
			return parts[appsIndex + 1];
		}

		const packagesIndex = parts.lastIndexOf("packages");
		if (packagesIndex !== -1 && packagesIndex < parts.length - 1) {
			return parts[packagesIndex + 1];
		}

		// Fallback: use the last directory name
		return parts[parts.length - 1];
	}

	/**
	 * Update the cache of detected ports for a worktree
	 */
	private updateWorktreePortsCache(worktreeId: string): void {
		const ports: DetectedPort[] = [];

		for (const monitored of this.monitoredTerminals.values()) {
			if (monitored.worktreeId === worktreeId) {
				const service = this.detectServiceName(monitored.cwd);

				for (const port of monitored.lastDetectedPorts) {
					ports.push({
						port,
						service,
						terminalId: monitored.terminalId,
						detectedAt: new Date().toISOString(),
					});
				}
			}
		}

		this.worktreePortsCache.set(worktreeId, ports);
	}

	/**
	 * Get all detected ports for a worktree
	 */
	getDetectedPorts(worktreeId: string): DetectedPort[] {
		return this.worktreePortsCache.get(worktreeId) || [];
	}

	/**
	 * Get detected ports as a map of service name to port
	 */
	getDetectedPortsMap(worktreeId: string): Record<string, number> {
		const ports = this.getDetectedPorts(worktreeId);
		const map: Record<string, number> = {};

		for (const detected of ports) {
			if (detected.service) {
				// If multiple terminals have the same service, use the first one
				if (!map[detected.service]) {
					map[detected.service] = detected.port;
				}
			}
		}

		return map;
	}

	/**
	 * Get all monitored terminals
	 */
	getMonitoredTerminals(): string[] {
		return Array.from(this.monitoredTerminals.keys());
	}

	/**
	 * Cleanup all monitoring
	 */
	cleanup(): void {
		for (const terminalId of this.monitoredTerminals.keys()) {
			this.stopMonitoring(terminalId);
		}
		this.worktreePortsCache.clear();
		console.log("[PortDetector] Cleaned up all monitoring");
	}
}

export const portDetector = PortDetector.getInstance();
