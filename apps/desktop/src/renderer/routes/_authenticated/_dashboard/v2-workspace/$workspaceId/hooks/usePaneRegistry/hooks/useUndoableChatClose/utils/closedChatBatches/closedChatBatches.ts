interface ClosedChatBatch<TChat> {
	id: string;
	chats: TChat[];
}

export interface ClosedChatBatchActions<TChat> {
	show: (batch: ClosedChatBatch<TChat>) => void;
	hide: (id: string) => void;
	restore: (chat: TChat) => void;
	stop: (chat: TChat) => void;
}

export function createClosedChatBatches<TChat>(
	actions: ClosedChatBatchActions<TChat>,
	createId: () => string = () => crypto.randomUUID(),
) {
	let pending: ClosedChatBatch<TChat> | null = null;

	const take = (id?: string) => {
		if (!pending || (id !== undefined && pending.id !== id)) return null;
		const batch = pending;
		pending = null;
		return batch;
	};

	return {
		add(chat: TChat) {
			const previous = take();
			if (previous) actions.hide(previous.id);
			pending = { id: createId(), chats: [...(previous?.chats ?? []), chat] };
			actions.show(pending);
		},
		undo(id: string) {
			const batch = take(id);
			if (!batch) return;
			actions.hide(batch.id);
			for (const chat of [...batch.chats].reverse()) actions.restore(chat);
		},
		expire(id: string) {
			const batch = take(id);
			if (!batch) return;
			for (const chat of batch.chats) actions.stop(chat);
		},
		flush() {
			const batch = take();
			if (!batch) return;
			actions.hide(batch.id);
			for (const chat of batch.chats) actions.stop(chat);
		},
	};
}
