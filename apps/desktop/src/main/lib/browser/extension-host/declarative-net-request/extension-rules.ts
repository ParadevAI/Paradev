import { DNR_CONSTANTS as LIMITS } from "shared/browser-extension-dnr";
import { isRegexRule, validateRule } from "./rule-validation";
import { RulesetIndex } from "./ruleset-index";
import {
	DYNAMIC_RULESET_ID,
	type Rule,
	type RulesetSource,
	SESSION_RULESET_ID,
} from "./types";

const GLOBAL_STATIC_RULE_LIMIT = 300_000;
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

/** Static rules that fail validation are skipped, as Chrome skips them at install. */
export function validStaticRules(raw: unknown): Rule[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((rule) => {
		try {
			validateRule(rule as Rule);
			return true;
		} catch {
			return false;
		}
	}) as Rule[];
}

function updatedRules(
	current: Rule[],
	{ removeRuleIds = [], addRules = [] }: UpdateRulesOptions,
	maxRules: number,
): Rule[] {
	const removed = new Set(removeRuleIds);
	const next = current.filter((rule) => !removed.has(rule.id));
	const ids = new Set(next.map((rule) => rule.id));
	for (const rule of addRules) {
		validateRule(rule);
		if (ids.has(rule.id)) {
			throw new Error(`Rule with id ${rule.id} does not have a unique ID.`);
		}
		ids.add(rule.id);
		next.push(rule);
	}
	if (next.length > maxRules) {
		throw new Error("Rule count exceeds the rule count limit.");
	}
	if (next.filter(isRegexRule).length > LIMITS.MAX_NUMBER_OF_REGEX_RULES) {
		throw new Error("Rule count exceeds the regex rule count limit.");
	}
	return next;
}

/**
 * One extension's declarativeNetRequest state: which static rulesets are on,
 * its dynamic rules (persisted) and session rules (in memory).
 */
export class ExtensionRules {
	private enabled: string[];
	private disabledRuleIds: Record<string, number[]> = {};
	private dynamicRules: Rule[] = [];
	private sessionRules: Rule[] = [];
	private readonly staticRules = new Map<string, Rule[]>();
	private readonly indexes = new Map<string, RulesetIndex>();
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		readonly extensionId: string,
		private readonly version: string,
		private readonly sources: RulesetSource[],
		private readonly storage: RulesStorage,
		private readonly readRuleset: (path: string) => Promise<unknown>,
	) {
		this.enabled = sources
			.filter((source) => source.enabled)
			.map((source) => source.id);
	}

	async load(): Promise<void> {
		const persisted = await this.storage.load().catch(() => null);
		if (persisted) {
			this.dynamicRules = validStaticRules(persisted.dynamicRules);
			if (persisted.version === this.version) {
				if (persisted.enabledRulesetIds) {
					const known = new Set(this.sources.map((source) => source.id));
					this.enabled = persisted.enabledRulesetIds.filter((id) =>
						known.has(id),
					);
				}
				this.disabledRuleIds = persisted.disabledRuleIds ?? {};
			}
		}
		await Promise.all(
			this.enabled.map((id) =>
				this.loadStatic(id).catch((error: unknown) => {
					console.warn(
						`[dnr] ${this.extensionId} ruleset "${id}" did not load:`,
						error,
					);
				}),
			),
		);
		this.indexes.set(
			DYNAMIC_RULESET_ID,
			new RulesetIndex(DYNAMIC_RULESET_ID, this.dynamicRules, DYNAMIC_RANK),
		);
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
		let used = 0;
		for (const id of this.enabled)
			used += this.staticRules.get(id)?.length ?? 0;
		return Math.max(
			0,
			LIMITS.GUARANTEED_MINIMUM_STATIC_RULES + GLOBAL_STATIC_RULE_LIMIT - used,
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
			await Promise.all(next.map((id) => this.loadStatic(id)));
			for (const id of this.enabled) {
				if (!next.includes(id)) {
					this.indexes.delete(id);
					this.staticRules.delete(id);
				}
			}
			this.enabled = next;
			await this.persist();
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
			this.assertKnown(options.rulesetId);
			const enable = new Set(options.enableRuleIds ?? []);
			const next = new Set(
				(this.disabledRuleIds[options.rulesetId] ?? []).filter(
					(id) => !enable.has(id),
				),
			);
			for (const id of options.disableRuleIds ?? []) next.add(id);
			if (next.size > 0) this.disabledRuleIds[options.rulesetId] = [...next];
			else delete this.disabledRuleIds[options.rulesetId];
			if (this.enabled.includes(options.rulesetId)) {
				this.indexes.delete(options.rulesetId);
				await this.loadStatic(options.rulesetId);
			}
			await this.persist();
		});
	}

	getDynamicRules(filter?: { ruleIds?: number[] }): Rule[] {
		return filterRules(this.dynamicRules, filter);
	}

	updateDynamicRules(options: UpdateRulesOptions): Promise<void> {
		return this.serialize(async () => {
			this.dynamicRules = updatedRules(
				this.dynamicRules,
				options,
				LIMITS.MAX_NUMBER_OF_DYNAMIC_RULES,
			);
			this.indexes.set(
				DYNAMIC_RULESET_ID,
				new RulesetIndex(DYNAMIC_RULESET_ID, this.dynamicRules, DYNAMIC_RANK),
			);
			await this.persist();
		});
	}

	getSessionRules(filter?: { ruleIds?: number[] }): Rule[] {
		return filterRules(this.sessionRules, filter);
	}

	updateSessionRules(options: UpdateRulesOptions): Promise<void> {
		return this.serialize(async () => {
			this.sessionRules = updatedRules(
				this.sessionRules,
				options,
				LIMITS.MAX_NUMBER_OF_SESSION_RULES,
			);
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

	private async loadStatic(id: string): Promise<void> {
		if (this.indexes.has(id)) return;
		const source = this.sources.find((candidate) => candidate.id === id);
		if (!source) return;
		let rules = this.staticRules.get(id);
		if (!rules) {
			rules = validStaticRules(await this.readRuleset(source.path));
			this.staticRules.set(id, rules);
		}
		this.indexes.set(
			id,
			new RulesetIndex(
				id,
				rules,
				STATIC_RANK,
				new Set(this.disabledRuleIds[id] ?? []),
			),
		);
	}

	private persist(): Promise<void> {
		return this.storage.save({
			version: this.version,
			enabledRulesetIds: this.enabled,
			disabledRuleIds: this.disabledRuleIds,
			dynamicRules: this.dynamicRules,
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
