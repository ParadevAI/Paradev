import type { DurableEvent, Envelope, Item } from "@superset/chat/protocol";
import { isDeltaEnvelope, isDurableEnvelope } from "@superset/chat/protocol";
import { and, asc, eq, like, or } from "drizzle-orm";
import type { ChatDb } from "../../db";
import { chatJournal } from "../../db";
import { readSessionRow } from "../../projection";

type SessionTree = {
	epoch: string;
	parents: Map<string, string>;
	subagents: Set<string>;
};

function addItem(tree: SessionTree, item: Item): void {
	if (item.parentItemId) tree.parents.set(item.id, item.parentItemId);
	if (item.kind === "tool_call" && (item as { subagent?: boolean }).subagent)
		tree.subagents.add(item.id);
}

export class SubagentItems {
	private readonly trees = new Map<string, SessionTree>();

	constructor(private readonly db: ChatDb) {}

	forget(sessionId: string): void {
		this.trees.delete(sessionId);
	}

	observe(envelope: Envelope): void {
		if (!isDurableEnvelope(envelope) || envelope.event.type !== "item") return;
		const tree = this.trees.get(envelope.sessionId);
		if (!tree) return;
		if (tree.epoch !== envelope.cursor.epoch) {
			this.trees.delete(envelope.sessionId);
			return;
		}
		addItem(tree, envelope.event.item);
	}

	hiddenFromFlatView(envelope: Envelope): boolean {
		if (isDeltaEnvelope(envelope)) {
			const { delta } = envelope;
			return delta.type === "text" && delta.parentItemId
				? this.underSubagent(envelope.sessionId, delta.parentItemId)
				: this.isNested(envelope.sessionId, delta.itemId);
		}
		if (!isDurableEnvelope(envelope) || envelope.event.type !== "item")
			return false;
		return this.hides(envelope.sessionId, envelope.event.item);
	}

	hides(sessionId: string, item: Item): boolean {
		return (
			item.kind !== "approval_request" && this.isNested(sessionId, item.id)
		);
	}

	private isNested(sessionId: string, itemId: string): boolean {
		const parent = this.treeFor(sessionId)?.parents.get(itemId);
		return parent !== undefined && this.underSubagent(sessionId, parent);
	}

	private underSubagent(sessionId: string, itemId: string): boolean {
		const tree = this.treeFor(sessionId);
		if (!tree) return false;
		const seen = new Set<string>();
		let parent: string | undefined = itemId;
		while (parent !== undefined && !seen.has(parent)) {
			if (tree.subagents.has(parent)) return true;
			seen.add(parent);
			parent = tree.parents.get(parent);
		}
		return false;
	}

	private treeFor(sessionId: string): SessionTree | null {
		const cached = this.trees.get(sessionId);
		if (cached) return cached;
		const session = readSessionRow(this.db, sessionId);
		if (!session) return null;
		const tree: SessionTree = {
			epoch: session.epoch,
			parents: new Map(),
			subagents: new Set(),
		};
		const rows = this.db
			.select({ eventJson: chatJournal.eventJson })
			.from(chatJournal)
			.where(
				and(
					eq(chatJournal.sessionId, sessionId),
					eq(chatJournal.epoch, session.epoch),
					or(
						like(chatJournal.eventJson, '%"parentItemId":%'),
						like(chatJournal.eventJson, '%"subagent":true%'),
					),
				),
			)
			.orderBy(asc(chatJournal.seq))
			.all();
		for (const row of rows) {
			try {
				const event = JSON.parse(row.eventJson) as DurableEvent;
				if (event.type === "item") addItem(tree, event.item);
			} catch {}
		}
		this.trees.set(sessionId, tree);
		return tree;
	}
}
