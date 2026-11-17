/**
 * The app the keyless dev model builds when asked for a budget app: a single-file React component that keeps expenses
 * in shared storage, so everyone in the chat sees them live, and splits the total evenly between the chat's people.
 * `settleUp` is the second version's change (who pays whom). Written without template literals so it can live in one.
 */
export function budgetApp({ settleUp }: { settleUp: boolean }) {
	return `import { useEffect, useState } from "react";
import { Plus, Trash2, Wallet${settleUp ? ", ArrowRight" : ""} } from "lucide-react";

const PREFIX = "expense:";
const shared = { shared: true };
const money = (cents) => (cents / 100).toFixed(2);

export default function Budget() {
  const [viewer, setViewer] = useState(null);
  const [people, setPeople] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [what, setWhat] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    const dev = window.dev;
    if (!dev) return;
    let unsubscribe = () => {};
    const load = async () => {
      const items = await dev.storage.list(PREFIX, shared);
      setExpenses(items.map((item) => ({ key: item.key, ...item.value })).sort((a, b) => a.at.localeCompare(b.at)));
    };
    (async () => {
      if (!(await dev.ready)) return;
      setViewer(dev.viewer);
      setPeople((await dev.members()).filter((m) => m.kind === "person"));
      await load();
      unsubscribe = dev.storage.subscribe(PREFIX, () => load().catch((e) => setError(e.message)), shared);
    })().catch((e) => setError(e.message));
    return () => unsubscribe();
  }, []);

  async function add(event) {
    event.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!what.trim() || !(cents > 0) || !viewer) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const expense = { what: what.trim(), cents, paidBy: viewer.id, paidByName: viewer.name, at: new Date().toISOString() };
    setWhat("");
    setAmount("");
    await window.dev.storage.set(PREFIX + id, expense, shared).catch((e) => setError(e.message));
  }

  const total = expenses.reduce((sum, e) => sum + e.cents, 0);
  const share = people.length ? total / people.length : 0;
  const balances = people.map((p) => {
    const paid = expenses.filter((e) => e.paidBy === p.id).reduce((sum, e) => sum + e.cents, 0);
    return { ...p, paid, balance: paid - share };
  });
${
	settleUp
		? `  const owing = balances.filter((b) => b.balance < -0.5).map((b) => ({ ...b, left: -b.balance }));
  const owed = balances.filter((b) => b.balance > 0.5).map((b) => ({ ...b, left: b.balance }));
  const transfers = [];
  for (const from of owing) {
    for (const to of owed) {
      const amount = Math.min(from.left, to.left);
      if (amount < 0.5) continue;
      transfers.push({ from: from.name, to: to.name, amount });
      from.left -= amount;
      to.left -= amount;
    }
  }
`
		: ""
}
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-6">
      <header className="flex items-center gap-3">
        <span className="bg-dev-accent text-dev-accent-text flex size-9 items-center justify-center rounded-lg">
          <Wallet size={18} />
        </span>
        <div>
          <h1 className="m-0 text-lg">Budget</h1>
          <p className="text-dev-muted m-0 text-sm">Shared with everyone in this chat, split evenly.</p>
        </div>
        <div className="ml-auto text-right">
          <div className="text-dev-muted text-xs">Total</div>
          <div className="text-xl font-semibold tabular-nums" aria-label="Total">{money(total)}</div>
        </div>
      </header>

      <form onSubmit={add} className="border-dev-border bg-dev-surface flex gap-2 rounded-xl border p-2">
        <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What for?" aria-label="What for?"
          className="min-w-0 flex-1 rounded-md bg-transparent px-2 py-1.5 outline-none" />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="Amount" inputMode="decimal"
          className="w-24 rounded-md bg-transparent px-2 py-1.5 text-right tabular-nums outline-none" />
        <button type="submit" className="bg-dev-accent text-dev-accent-text flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium">
          <Plus size={14} /> Add
        </button>
      </form>
      {error && <p className="m-0 text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="text-dev-muted mb-2 text-xs font-medium tracking-wide uppercase">Expenses</h2>
        {expenses.length === 0 ? (
          <p className="text-dev-muted text-sm">Nothing yet. Add what you paid for.</p>
        ) : (
          <ul className="border-dev-border m-0 list-none divide-y divide-[var(--dev-border)] rounded-xl border p-0">
            {expenses.map((e) => (
              <li key={e.key} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1">{e.what}</span>
                <span className="text-dev-muted text-sm">{e.paidByName}</span>
                <span className="w-20 text-right tabular-nums">{money(e.cents)}</span>
                <button onClick={() => window.dev.storage.delete(e.key, shared)} aria-label={"Remove " + e.what}
                  className="text-dev-muted hover:text-dev-text rounded p-1">
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-dev-muted mb-2 text-xs font-medium tracking-wide uppercase">Split</h2>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {balances.map((b) => (
            <li key={b.id} className="border-dev-border bg-dev-surface rounded-xl border px-3 py-2" aria-label={"Split for " + b.name}>
              <div className="truncate text-sm font-medium">{b.name}</div>
              <div className="text-dev-muted text-xs">paid {money(b.paid)}</div>
              <div className={"tabular-nums " + (b.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-dev-accent")}>
                {b.balance >= 0 ? "gets back " + money(b.balance) : "owes " + money(-b.balance)}
              </div>
            </li>
          ))}
        </ul>
      </section>
${
	settleUp
		? `
      <section>
        <h2 className="text-dev-muted mb-2 text-xs font-medium tracking-wide uppercase">Settle up</h2>
        {transfers.length === 0 ? (
          <p className="text-dev-muted text-sm">All square.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {transfers.map((t) => (
              <li key={t.from + t.to} className="flex items-center gap-2 text-sm">
                {t.from} <ArrowRight size={14} className="text-dev-muted" /> {t.to}
                <span className="ml-auto tabular-nums">{money(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
`
		: ""
}    </main>
  );
}
`;
}
