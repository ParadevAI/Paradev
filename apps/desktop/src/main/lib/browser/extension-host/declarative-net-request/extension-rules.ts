import { DNR_CONSTANTS as LIMITS } from "shared/browser-extension-dnr";
import {
	isRegexRule,
	type ValidateOptions,
	validateRule,
} from "./rule-validation";
import { RulesetIndex } from "./ruleset-index";
import {
	DYNAMIC_RULESET_ID,
	type Rule,
	type RulesetSource,
	SESSION_RULESET_ID,
} from "./types";

const GLOBAL_STATIC_RULE_LIMIT = 300_000;
const MAX_DISABLED_STATIC_RULES = 5_000;
const STATIC_RANK = 1;
const DYNAMIC_RANK = 2;
const SESSION_RANK = 3;

/** What survives a restart. Enabled and disabled static rules reset on update, as in Chrome. */
export interface PersistedRules {
	version: string;
	enabledRulesetIds?: string[];
	disabledRuleIds?: Record<string, number[]>;
	dynamicRules?: Rule[];
}

export interface RulesStorage {
	load(): Promise<PersistedRules | null>;
	save(rules: PersistedRules): Promise<void>;
}

export interface UpdateRulesOptions {
	removeRuleIds?: number[];
	addRules?: Rule[];
}

/**
 * Chrome's global static rule pool, shared by every extension in a session.
 * Each extension gets the guaranteed minimum; rules past it draw on the pool.
 */
export class StaticRulePool {
	private readonly used = new Map<string, number>();

	set(extensionId: string, count: number): void {
		this.used.set(extensionId, count);
	}

	get(extensionId: string): number {
		return this.used.get(extensionId) ?? 0;
	}

	delete(extensionId: string): void {
		this.used.delete(extensionId);
	}

	/** The most enabled static rules `extensionId` may have. */
	capacity(extensionId: string): number {
		let shared = GLOBAL_STATIC_RULE_LIMIT;
		for (const [other, count] of this.used) {
			if (other !== extensionId) {
				shared -= Math.max(0, count - LIMITS.GUARANTEED_MINIMUM_STATIC_RULES);
			}
		}
		return LIMITS.GUARANTEED_MINIMUM_STATIC_RULES + Math.max(0, shared);
	}
}

/** Rules that fail validation are skipped, as Chrome skips them at install. */
export function validRules(raw: unknown, options?: ValidateOptions): Rule[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((rule) => {
		try {
			validateRule(rule as Rule, options);
			return true;
		} catch {
			return false;
		}
	}) as Rule[];
}

/** A static ruleset's rules; throws for a ruleset Chrome would ignore. */
export function staticRulesetRules(raw: unknown): Rule[] {
	const rules = validRules(raw);
	const ids = new Set<number>();
	for (const rule of rules) {
		if (ids.has(rule.id)) {
			throw new Error(`Rule with id ${rule.id} does not have a unique ID.`);
		}
		ids.add(rule.id);
	}
	if (rules.filter(isRegexRule).length > LIMITS.MAX_NUMBER_OF_REGEX_RULES) {
		throw new Error("The ruleset exceeds the regex rule count limit.");
	}
	return rules;
}

function isUnsafeRule(rule: Rule): boolean {
	return (
		rule.action.type === "redirect" || rule.action.type === "modifyHeaders"
	);
}

function updatedRules(
	current: Rule[],
	{ removeRuleIds = [], addRules = [] }: UpdateRulesOptions,
	limits: { rules: number; unsafeRules: number; session: boolean },
): Rule[] {
	const removed = new Set(removeRuleIds);
	const next = current.filter((rule) => !removed.has(rule.id));
	const ids = new Set(next.map((rule) => rule.id));
	for (const rule of addRules) {
		validateRule(rule, { session: limits.session });
		if (ids.has(rule.id)) {
			throw new Error(`Rule with id ${rule.id} does not have a unique ID.`);
		}
		ids.add(rule.id);
		next.push(rule);
	}
	if (next.length > limits.rules) {
		throw new Error("Rule count exceeds the rule count limit.");
	}
	if (next.filter(isUnsafeRule).length > limits.unsafeRules) {
		throw new Error("Rule count exceeds the unsafe rule count limit.");
	}
	if (next.filter(isRegexRule).length > LIMITS.MAX_NUMBER_OF_REGEX_RULES) {
		throw new Error("Rule count exceeds the regex rule count limit.");
	}
	return next;
}

/** Saved dynamic rules, in order, up to the limits an update would enforce. */
function savedDynamicRules(rules: Rule[]): Rule[] {
	const ids = new Set<number>();
	let unsafe = 0;
	let regex = 0;
	return rules.filter((rule) => {
		if (ids.has(rule.id) || ids.size >= LIMITS.MAX_NUMBER_OF_DYNAMIC_RULES) {
			return false;
		}
		if (isUnsafeRule(rule)) {
			if (unsafe >= LIMITS.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES) return false;
			unsafe++;
		}
		if (isRegexRule(rule)) {
			if (regex >= LIMITS.MAX_NUMBER_OF_REGEX_RULES) return false;
			regex++;
		}
		ids.add(rule.id);
		return true;
	});
}

function savedDisabledRuleIds(raw: unknown): Record<string, number[]> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
	const result: Record<string, number[]> = {};
	for (const [id, ruleIds] of Object.entries(raw)) {
		if (Array.isArray(ruleIds)) {
			result[id] = ruleIds.filter((ruleId) => Number.isInteger(ruleId));
		}
	}
	const total = Object.values(result).reduce((sum, ids) => sum + ids.length, 0);
	return total > MAX_DISABLED_STATIC_RULES ? {} : result;
}

/**
 * One extension's declarativeNetRequest state: which static rulesets are on,
 * its dynamic rules (persisted) and session rules (in memory). An update
 * takes effect only once it is saved.
 */
export class ExtensionRules {
	private enabled: string[];
	private disabledRuleIds: Record<string, number[]> = {};
	private dynamicRules: Rule[] = [];
	private sessionRules: Rule[] = [];
	private readonly staticRules = new Map<string, Rule[]>();
	private readonly indexes = new Map<string, RulesetIndex>();
	private queue: Promise<unknown> = Promise.resolve();
	// Set when the saved rules could not be read, so an update cannot overwrite them.
	private savedRulesUnreadable = false;
	private disposed = false;

	constructor(
		readonly extensionId: string,
		private readonly version: string,
		private readonly sources: RulesetSource[],
		private readonly storage: RulesStorage,
		private readonly readRuleset: (path: string) => Promise<unknown>,
		private readonly pool = new StaticRulePool(),
	) {
		this.enabled = sources
			.filter((source) => source.enabled)
			.map((source) => source.id);
	}

	async load(): Promise<void> {
		const persisted = await this.storage.load().catch((error: unknown) => {
			console.error(
				`[dnr] ${this.extensionId} saved rules could not be read; changes stay unsaved this session:`,
				error,
			);
			this.savedRulesUnreadable = true;
			return null;
		});
		if (persisted) {
			this.dynamicRules = savedDynamicRules(validRules(persisted.dynamicRules));
			const dropped =
				(Array.isArray(persisted.dynamicRules)
					? persisted.dynamicRules.length
					: 0) - this.dynamicRules.length;
			if (dropped > 0) {
				console.warn(
					`[dnr] ${this.extensionId}: skipped ${dropped} saved dynamic rules that are invalid or over the limits`,
				);
			}
			if (persisted.version === this.version) {
				if (Array.isArray(persisted.enabledRulesetIds)) {
					const known = new Set(this.sources.map((source) => source.id));
					this.enabled = persisted.enabledRulesetIds.filter(
						(id) => typeof id === "string" && known.has(id),
					);
				}
				this.disabledRuleIds = savedDisabledRuleIds(persisted.disabledRuleIds);
			}
		}
		const loaded = await Promise.all(
			this.enabled.map(async (id) => {
				try {
					return [id, await this.staticIndex(id)] as const;
				} catch (error) {
					console.warn(
						`[dnr] ${this.extensionId} ruleset "${id}" did not load:`,
						error,
					);
					return null;
				}
			}),
		);
		// The same limits updateEnabledRulesets enforces; rulesets past them stay off.
		const enabled: string[] = [];
		let ruleCount = 0;
		let regexCount = 0;
		for (const [id, index] of loaded.flatMap((entry) =>
			entry ? [entry] : [],
		)) {
			const rules = this.staticRules.get(id) ?? [];
			const regex = rules.filter(isRegexRule).length;
			if (
				enabled.length >= LIMITS.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS ||
				ruleCount + rules.length > this.pool.capacity(this.extensionId) ||
				regexCount + regex > LIMITS.MAX_NUMBER_OF_REGEX_RULES
			) {
				console.warn(
					`[dnr] ${this.extensionId} ruleset "${id}" is over the static rule limits; left disabled`,
				);
				continue;
			}
			enabled.push(id);
			ruleCount += rules.length;
			regexCount += regex;
			this.indexes.set(id, index);
		}
		this.enabled = enabled;
		this.claimStaticRules(ruleCount);
		this.indexes.set(
			DYNAMIC_RULESET_ID,
			new RulesetIndex(DYNAMIC_RULESET_ID, this.dynamicRules, DYNAMIC_RANK),
		);
	}

	/** Stops saving, and resolves once any save in progress has finished. */
	dispose(): Promise<unknown> {
		this.disposed = true;
		this.pool.delete(this.extensionId);
		return this.queue;
	}

	/** Enabled static rulesets in manifest order, then dynamic, then session. */
	rulesets(): RulesetIndex[] {
		const ordered = [
			...this.sources
				.filter((source) => this.enabled.includes(source.id))
				.map((source) => source.id),
			DYNAMIC_RULESET_ID,
			SESSION_RULESET_ID,
		];
		return ordered.flatMap((id) => this.indexes.get(id) ?? []);
	}

	getEnabledRulesets(): string[] {
		return this.sources
			.filter((source) => this.enabled.includes(source.id))
			.map((source) => source.id);
	}

	getAvailableStaticRuleCount(): number {
		return Math.max(
			0,
			this.pool.capacity(this.extensionId) - this.staticRuleCount(this.enabled),
		);
	}

	updateEnabledRulesets(options: {
		enableRulesetIds?: string[];
		disableRulesetIds?: string[];
	}): Promise<void> {
		return this.serialize(async () => {
			const known = new Set(this.sources.map((source) => source.id));
			const enable = options.enableRulesetIds ?? [];
			const disable = new Set(options.disableRulesetIds ?? []);
			for (const id of [...enable, ...disable]) {
				if (!known.has(id)) throw new Error(`Invalid ruleset id: ${id}.`);
			}
			const next = [
				...new Set([
					...this.enabled.filter((id) => !disable.has(id)),
					...enable,
				]),
			];
			if (next.length > LIMITS.MAX_NUMBER_OF_ENABLED_STATIC_RULESETS) {
				throw new Error(
					"The number of enabled static rulesets exceeds the enabled ruleset count limit.",
				);
			}
			const added = new Map<string, RulesetIndex>();
			for (const id of next) {
				if (!this.indexes.has(id)) added.set(id, await this.staticIndex(id));
			}
			const ruleCount = this.staticRuleCount(next);
			if (ruleCount > this.pool.capacity(this.extensionId)) {
				throw new Error(
					"The number of enabled static rules exceeds the static rule count limit.",
				);
			}
			const regexCount = next.reduce(
				(sum, id) =>
					sum + (this.staticRules.get(id) ?? []).filter(isRegexRule).length,
				0,
			);
			if (regexCount > LIMITS.MAX_NUMBER_OF_REGEX_RULES) {
				throw new Error(
					"The number of enabled regular expression rules exceeds the regex rule count limit.",
				);
			}
			// Claim the pool before the save so a concurrent update elsewhere sees it.
			const previous = this.pool.get(this.extensionId);
			this.claimStaticRules(ruleCount);
			try {
				await this.persist({ enabledRulesetIds: next });
			} catch (error) {
				this.claimStaticRules(previous);
				throw error;
			}
			for (const id of this.enabled) {
				if (!next.includes(id)) {
					this.indexes.delete(id);
					this.staticRules.delete(id);
				}
			}
			for (const [id, index] of added) this.indexes.set(id, index);
			this.enabled = next;
		});
	}

	getDisabledRuleIds(rulesetId: string): number[] {
		this.assertKnown(rulesetId);
		return [...(this.disabledRuleIds[rulesetId] ?? [])];
	}

	updateStaticRules(options: {
		rulesetId: string;
		disableRuleIds?: number[];
		enableRuleIds?: number[];
	}): Promise<void> {
		return this.serialize(async () => {
			const { rulesetId } = options;
			this.assertKnown(rulesetId);
			const enable = new Set(options.enableRuleIds ?? []);
			const next = new Set(
				(this.disabledRuleIds[rulesetId] ?? []).filter((id) => !enable.has(id)),
			);
			for (const id of options.disableRuleIds ?? []) next.add(id);
			const disabledRuleIds = { ...this.disabledRuleIds };
			if (next.size > 0) disabledRuleIds[rulesetId] = [...next];
			else delete disabledRuleIds[rulesetId];
			const total = Object.values(disabledRuleIds).reduce(
				(sum, ids) => sum + ids.length,
				0,
			);
			if (total > MAX_DISABLED_STATIC_RULES) {
				throw new Error(
					"The number of disabled static rules exceeds the disabled rule count limit.",
				);
			}
			const index = this.enabled.includes(rulesetId)
				? await this.staticIndex(rulesetId, new Set(next))
				: null;
			await this.persist({ disabledRuleIds });
			this.disabledRuleIds = disabledRuleIds;
			if (index) this.indexes.set(rulesetId, index);
		});
	}

	getDynamicRules(filter?: { ruleIds?: number[] }): Rule[] {
		return filterRules(this.dynamicRules, filter);
	}

	updateDynamicRules(options: UpdateRulesOptions): Promise<void> {
		return this.serialize(async () => {
			const next = updatedRules(this.dynamicRules, options, {
				rules: LIMITS.MAX_NUMBER_OF_DYNAMIC_RULES,
				unsafeRules: LIMITS.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES,
				session: false,
			});
			await this.persist({ dynamicRules: next });
			this.dynamicRules = next;
			this.indexes.set(
				DYNAMIC_RULESET_ID,
				new RulesetIndex(DYNAMIC_RULESET_ID, next, DYNAMIC_RANK),
			);
		});
	}

	getSessionRules(filter?: { ruleIds?: number[] }): Rule[] {
		return filterRules(this.sessionRules, filter);
	}

	updateSessionRules(options: UpdateRulesOptions): Promise<void> {
		return this.serialize(async () => {
			this.sessionRules = updatedRules(this.sessionRules, options, {
				rules: LIMITS.MAX_NUMBER_OF_SESSION_RULES,
				unsafeRules: LIMITS.MAX_NUMBER_OF_UNSAFE_SESSION_RULES,
				session: true,
			});
			this.indexes.set(
				SESSION_RULESET_ID,
				new RulesetIndex(SESSION_RULESET_ID, this.sessionRules, SESSION_RANK),
			);
		});
	}

	private assertKnown(rulesetId: string) {
		if (!this.sources.some((source) => source.id === rulesetId)) {
			throw new Error(`Invalid ruleset id: ${rulesetId}.`);
		}
	}

	private claimStaticRules(count: number): void {
		if (!this.disposed) this.pool.set(this.extensionId, count);
	}

	private staticRuleCount(ids: string[]): number {
		return ids.reduce(
			(sum, id) => sum + (this.staticRules.get(id)?.length ?? 0),
			0,
		);
	}

	private async staticIndex(
		id: string,
		disabled = new Set(this.disabledRuleIds[id] ?? []),
	): Promise<RulesetIndex> {
		const source = this.sources.find((candidate) => candidate.id === id);
		if (!source) throw new Error(`Invalid ruleset id: ${id}.`);
		let rules = this.staticRules.get(id);
		if (!rules) {
			rules = staticRulesetRules(await this.readRuleset(source.path));
			this.staticRules.set(id, rules);
		}
		return new RulesetIndex(id, rules, STATIC_RANK, disabled);
	}

	private persist(changes: Partial<PersistedRules>): Promise<void> {
		if (this.savedRulesUnreadable || this.disposed) return Promise.resolve();
		return this.storage.save({
			version: this.version,
			enabledRulesetIds: this.enabled,
			disabledRuleIds: this.disabledRuleIds,
			dynamicRules: this.dynamicRules,
			...changes,
		});
	}

	/** API calls apply in the order the extension made them. */
	private serialize<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => undefined);
		return run;
	}
}

function filterRules(rules: Rule[], filter?: { ruleIds?: number[] }): Rule[] {
	const ids = filter?.ruleIds && new Set(filter.ruleIds);
	return structuredClone(
		ids ? rules.filter((rule) => ids.has(rule.id)) : rules,
	);
}
