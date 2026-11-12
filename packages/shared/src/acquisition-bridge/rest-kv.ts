import type { AcquisitionKV } from "./server";

export class AcquisitionRestKV implements AcquisitionKV {
	constructor(
		private readonly url: string,
		private readonly token: string,
	) {}
	private async command<T>(command: (string | number)[]): Promise<T> {
		const response = await fetch(this.url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(command),
			cache: "no-store",
			signal: AbortSignal.timeout(1500),
		});
		if (!response.ok) throw new Error("Acquisition store unavailable");
		const result = (await response.json()) as { result: T; error?: string };
		if (result.error) throw new Error("Acquisition store command failed");
		return result.result;
	}
	async get<T>(key: string): Promise<T | null> {
		const value = await this.command<string | null>(["GET", key]);
		return value === null ? null : (JSON.parse(value) as T);
	}
	async getdel<T>(key: string): Promise<T | null> {
		const value = await this.command<string | null>(["GETDEL", key]);
		return value === null ? null : (JSON.parse(value) as T);
	}
	set(
		key: string,
		value: unknown,
		options: { ex?: number; nx?: boolean } = {},
	) {
		return this.command([
			"SET",
			key,
			JSON.stringify(value),
			...(options.ex ? ["EX", options.ex] : []),
			...(options.nx ? ["NX"] : []),
		]);
	}
	eval(script: string, keys: string[], args: (string | number)[]) {
		return this.command(["EVAL", script, keys.length, ...keys, ...args]);
	}
}
