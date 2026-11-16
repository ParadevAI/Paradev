import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The platform's skill for drawing sketches, written into every box so the prompt can stay short and point at it. It is
 * Dev's, not the owner's: rewritten at every session start, so an edit in the box never sticks.
 */
const SKILL = `---
name: dev-sketches
description: How to draw Dev sketches (charts, comparisons, plans, diagrams, tools) that read at a glance in the chat and feel native on iPhone, iPad and the Mac. Read it before you sketch, or write or change a saved sketch.
---

# Drawing Dev sketches

A sketch is an HTML page or a React component you draw in the chat with your \`sketch\` tool. It's posted as your
message: people see its picture (rendered at 640 px wide, the height you give) and click it to open it live, beside
the chat on the Mac and full screen on the phone. A sketch shows; a saved sketch remembers.

## When to sketch
Sketch when people need to see something to understand it; your reply then doesn't describe it (people see it):
- numbers to compare or add up: a budget, who owes whom, prices, scores, before and after, a forecast;
- a plan in time: an itinerary, a timeline, a schedule or rota, a countdown, a roadmap;
- options side by side: flights, places, products, plans, pros and cons;
- shape and structure: a flow, a decision tree, an org chart, how things connect, a floor or seating plan;
- data from your connected apps or the chat: a chart of trends, parts of a whole, a ranking, a status board.
When someone says show, compare, visualise, chart, map out, plan or break down, sketch. When you'd write a table
comparing three or more things, or a list of numbers, sketch it instead, without being asked. Don't sketch a
one-line answer, a single number or a short list: text is faster there. Never sketch to ask something: a decision or
a detail you need from people is a question (the question tool), which they answer in the chat.

## Draw for the picture
The picture is what everyone sees first, often on a phone, often without opening it:
- Lead with the point: the total, the winner, the next step, big and at the top. Then the detail.
- Give it room: the page has no margin of its own, so pad it (p-5 or 20-24 px all round); nothing touches an edge.
- Fit the height: pick the tool's height (200-1200 px at 640 wide) for what you drew, so nothing is cut off and
  there's no empty space below. A chart or a card: 300-420. A timeline or a comparison of 4-6 options: 500-800.
- Design it: a clear title, one accent colour, Dev's colours (below), real spacing, aligned numbers (tabular-nums),
  labels on the chart rather than a legend when you can. No lorem, no placeholders, no "click to load".
- Self-contained: the data baked in. A sketch with no buttons is fine; when it has controls (a slider, tabs, a
  toggle) the picture shows its first state, so make that the useful one.
- It must read in both themes (people see the dark picture in dark mode): use the dev-* colours, and give every
  colour you pick yourself its dark: partner (bg-green-50 dark:bg-green-950, text-green-700 dark:text-green-300), or a
  background of your own with its text colour.
- Opened live it's about 480 px wide beside the chat on the Mac and 390 on a phone: let it reflow (flex-wrap, grid with
  auto-fit) rather than scroll sideways.

## Saving
Sketches aren't saved: each lives in its message, and people find it by scrolling to it. Saved sketches are listed in
the chat's top bar and everyone's sidebar, keep data (storage) and may call you, models and connected apps. Save one (the
tool's save: true, or \`dev sketch save <id>\`) only when it has to keep data or people will come back to it: a
tracker, a shared list, a calculator they reuse, a board they update. People can save any sketch themselves. A saved
sketch is changed with \`dev sketch publish <file> --app <id>\`: every publish is a version, changed in place
without a new message in the chat.

\`dev sketch unsave <id>\` takes a saved sketch off the list (its message still shows it); \`dev sketch delete <id>\`
deletes it from the chat. Do either only when someone asks. A saved sketch's data goes with it when it's deleted, so ask
with the question tool and delete it only once they confirm.

## Dev draws the chrome
Dev already shows the sketch's name in a native header (a glass bar on the phone, a slim bar on the Mac) with a back
button and the sketch's menu. So a sketch never draws its own title bar, logo, top search field or floating + button: put
those in Dev's header with dev.ui, and they look native on both (SF Symbols and iOS controls on the phone,
Dev's own buttons, dialogs and menus on the Mac). The sketch is its content: lists, forms, charts.

    dev.ui.setActions([{ id: "add", title: "Add", icon: "add" }, { id: "refresh", title: "Refresh", icon: "refresh" }]);
    const offAction = dev.ui.onAction((id) => { if (id === "add") addSomething(); });
    dev.ui.setSearch("Search issues");                 // a search field in the header; null removes it
    const offSearch = dev.ui.onSearch((text) => setQuery(text));

- setActions: at most 3 buttons; icon is one of add, refresh, search, filter, sort, share, edit, delete, done,
  calendar, settings, more, info, star, list, grid, chart (without one, the title shows). Call it again to change
  them (a spinning refresh: drop it while loading, or keep it and ignore presses). Set them after dev.ready.
- await dev.ui.confirm({ title, message, confirmLabel, destructive }) → true or false: a native alert. Use it
  before deleting anything; never draw your own "are you sure" dialog.
- await dev.ui.choose({ title, options: [{ id, title, destructive }] }) → id or null: an action sheet on the
  phone, a menu on the Mac. For "Sort by", "Move to", a row's more actions.
- await dev.ui.prompt({ title, placeholder, value, confirmLabel }) → text or null: one line of text (rename, a
  quick add).
- await dev.ui.pick({ title, placeholder, items: [{ id, title, subtitle }], allowCustom }) → { id }, { text } (the
  viewer's own words, with allowCustom) or null: a searchable list in a native sheet. Use it to add from a long list.
- dev.ui.haptic("success" | "selection" | "light" | "medium" | "warning" | "error"): a tap of feedback on the
  phone when something completes (ticking a box: selection; finishing all: success). Nothing on the Mac.
- dev.platform is "ios", "mac" or "web" (a preview); <html data-dev-platform="…"> lets CSS adapt. You rarely
  need it: the same calls work everywhere.
- Rows look like iOS lists: full-width rows at least 44 px tall, a hairline divider, title in 17 px on the phone,
  secondary text in text-dev-muted below or at the trailing edge; checkmarks and chevrons rather than web
  checkboxes and links.

## Layout
- Mobile first: one column by default; from md (768 px, iPad and Mac) two columns where it helps (list beside detail,
  form beside chart); cap the content width (max-w-3xl or max-w-5xl, mx-auto) so it never stretches.
- A dashboard or board that really needs the width can ask for it: in an .html sketch,
  <meta name="dev-layout" content="full"> in <head>; in a JSX sketch, at the module's top level,
  document.head.insertAdjacentHTML("beforeend", '<meta name="dev-layout" content="full">').
- The host's bars overlap the sketch on the phone (the glass header on top, the home indicator below). Dev pads <html>
  by them for you, so normal content is clear. Anything position: fixed or sticky must add them itself:
  a bottom tab bar gets padding-bottom: var(--dev-safe-bottom), a sticky header top: var(--dev-safe-top).
  The variables are 0 on the Mac.
- Navigation inside the sketch: a list that opens a detail view (with a back button in the sketch), or a bottom tab bar
  (fixed, 3 to 5 tabs, icon over a short label) for sketches with a few top-level sections. Keep state in React, not the URL.
- Every list has an empty state: one line saying what goes here and the button that adds the first item.

## Touch and type
- Touch targets at least 44 × 44 px (min-h-11 min-w-11), with 8 px between them.
- Inputs, selects and textareas at 16 px (text-base) or larger: smaller text makes iOS zoom the whole sketch on focus.
- Use inputMode="decimal" or "numeric" for numbers, type="date" for dates. No hover-only controls.
- alert(), confirm() and prompt() are blocked: use dev.ui.confirm / prompt / choose. Show results as an inline
  message or a toast that fades.

## Colour and theme
- Dev's colours are Tailwind classes: bg-dev-bg (page), bg-dev-surface (cards), text-dev-text,
  text-dev-muted, border-dev-border, bg-dev-accent with text-dev-accent-text (primary buttons).
- dark: variants follow the viewer's theme (Dev sets the dark class); the dev-* colours flip by themselves.
- Charts (recharts): stroke and fill with var(--dev-chart-1) … var(--dev-chart-5); they follow the theme too.
  Axis ticks and grid in var(--dev-muted) and var(--dev-border).
- Rounded cards (rounded-xl), generous spacing (p-4, gap-3), one accent colour, system font (already set).

## Data
- Only a saved sketch has storage, and only it may ask you, a model or a connected app: in an unsaved one those calls fail
  with the code "unsaved". Draw an unsaved sketch from data you bake in.
- Await dev.ready before reading storage. It resolves false outside Dev: render an empty, working sketch then.
- Personal by default: dev.storage.get/set/list/delete(key) are the viewer's own. Pass { shared: true } for what
  everyone in the chat shares (a feed, a leaderboard, a group list).
- Live: dev.storage.subscribe(prefix, ({ key, value }) => …, { shared: true }) hears others' changes; update
  state from it rather than polling. Unsubscribe in the effect's cleanup.
- Save as people go (every tick, every typed value on blur), so closing the sketch mid-task loses nothing; restore
  in-progress state on load.
- One key per record (workouts/<id>) rather than one big array, so two people writing don't overwrite each other.

## Asking you
- await dev.agent.ask(question) asks you, the Dev that made the sketch, in this chat, as the person using it
  (the chat's own Dev answers if you've left it). You answer with your memory, tasks, connected apps and the chat, so use
  it for anything that needs judgement: "plan my week from my tasks", "what did we decide about the hotel?". Show a
  spinner: an answer takes seconds. dev.agent is { id, name } of whom it asks once ready; a null id means nobody,
  and ask fails with the code "no_agent".
- await dev.complete(prompt) is one plain model call (no memory, tools or chat), for rewording, summing up or
  classifying text the sketch already has.

## Connected apps
- dev.plugins works with the viewer's own connected apps (their Gmail, their Linear), never yours or the chat's:
  await dev.plugins.list() → [{ name: "gmail", displayName, accounts: [{ id, label }] }], the apps they connected.
- Tools are Composio tool slugs (GMAIL_SEND_EMAIL, GMAIL_FETCH_EMAILS, LINEAR_CREATE_ISSUE, LINEAR_LIST_LINEAR_ISSUES).
  Find them and their arguments with await dev.plugins.tools("gmail") → [{ name, title, description, inputSchema }];
  don't guess a slug or an argument.
- await dev.plugins.call("linear", "LINEAR_CREATE_ISSUE", { team_id, title }, { account }) → the tool's data. The
  first call of each tool asks the viewer to allow it. With several accounts of an app, pass account (an id or a
  label from list()) and let them pick it in the sketch. Errors have a code: not_connected (show its message: Dev
  tells them where to connect), denied, choose_account, tool_failed.

## Check it
The sketch tool hands you back the picture it posted: look at it, and if it's cut off, touches the edges, leaves empty space below or is wrong, sketch
again with replace set to its id: the new one takes its place, so the chat never shows both.
Before you draw something with a flow to try, and before every publish of a saved sketch, preview it first:

    dev sketch preview /agent/apps/<name>/<Name>.jsx --width 390 --height 844

It builds the sketch exactly as \`dev sketch publish\` would and renders it in a headless browser on Dev's server; nothing
is published or posted. It prints the screenshot's path, then the console, page errors and failed requests (or the
build's errors, which you fix first). Then:
1. Read the screenshot (your read tool shows you the image) and look at it as the person will: is anything cut off,
   overlapping, unreadable, empty where it shouldn't be, off-theme?
2. Fix every page error and console error. "Failed requests" are things the sketch tried to load: sketches have no
   network, so bake the data in.
3. Preview again until it's clean, then publish.
Options: --width/--height (default 1280 × 800: the Mac; 390 × 844: an iPhone), --full-page, --theme dark,
--wait <ms> (let it settle), --click "<text or selector>" and --type "<field>=<text>" (repeatable, run in order) to
try a flow, e.g. --type "Amount=12" --click "Add" and look that the item shows. \`dev sketch preview <sketch id>\`
renders the published version.
In a preview, window.dev is a stand-in: dev.ready resolves true, the viewer is "Preview", storage works but
starts empty and is gone after the render, members() is just the viewer, and dev.complete, dev.ask,
dev.agent.ask and dev.plugins.call fail with the code "unavailable". So a sketch that needs data shows its empty state: add an item with
--type and --click to see it filled. Dev's header isn't there: the buttons and search you set with dev.ui are
drawn as a plain bar at the top of the page (--click "Add" presses one), and confirm answers false, choose, prompt
and pick null (as if the viewer dismissed them). The same bar shows in a Dev app too old to draw dev.ui, so a
sketch keeps working there: never leave a flow reachable only through pick or choose without handling null.

## Sketch or file
- Something to read, print or keep (an itinerary, a budget sheet, a photo, a zip) is a file, not a sketch: write it
  under /agent and \`dev file share <path> --title "<Name>"\`; people open, preview and save it from its card.
- A sketch can't load a shared file (no network): bake the data into the sketch, or put it in storage.

## Reference
A phone-first list with live shared data, an empty state, Dev's header for adding and a native confirm before
deleting:

    import { useEffect, useState } from "react";
    import { Trash2 } from "lucide-react";

    export default function Groceries() {
      const [items, setItems] = useState([]);

      useEffect(() => {
        let offStorage = () => {};
        let offAction = () => {};
        dev.ready.then(async (inDev) => {
          if (!inDev) return;
          dev.ui.setActions([{ id: "add", title: "Add item", icon: "add" }]);
          offAction = dev.ui.onAction((id) => id === "add" && add());
          const rows = await dev.storage.list("item/", { shared: true });
          setItems(rows.map((r) => r.value));
          offStorage = dev.storage.subscribe("item/", ({ key, value }) => {
            setItems((all) => [...all.filter((i) => "item/" + i.id !== key), ...(value ? [value] : [])]);
          }, { shared: true });
        });
        return () => { offStorage(); offAction(); };
      }, []);

      async function add() {
        const name = await dev.ui.prompt({ title: "Add to the list", placeholder: "Oat milk", confirmLabel: "Add" });
        if (!name?.trim()) return;
        const item = { id: crypto.randomUUID(), name: name.trim(), done: false };
        setItems((all) => [...all, item]);
        await dev.storage.set("item/" + item.id, item, { shared: true });
      }

      async function toggle(item) {
        const next = { ...item, done: !item.done };
        setItems((all) => all.map((i) => (i.id === item.id ? next : i)));
        dev.ui.haptic("selection");
        await dev.storage.set("item/" + item.id, next, { shared: true });
      }

      async function remove(item) {
        if (!(await dev.ui.confirm({ title: "Delete " + item.name + "?", confirmLabel: "Delete", destructive: true }))) return;
        setItems((all) => all.filter((i) => i.id !== item.id));
        await dev.storage.delete("item/" + item.id, { shared: true });
      }

      if (items.length === 0) {
        return <p className="px-6 py-16 text-center text-dev-muted">Nothing on the list yet. Tap + to add the first thing.</p>;
      }
      return (
        <ul className="mx-auto max-w-xl divide-y divide-dev-border">
          {items.map((i) => (
            <li key={i.id} className="flex min-h-12 items-center gap-3 pl-4">
              <button className="flex min-h-12 flex-1 items-center gap-3 text-left" onClick={() => toggle(i)}>
                <span className={"flex size-6 items-center justify-center rounded-full border " + (i.done ? "border-dev-accent bg-dev-accent text-dev-accent-text" : "border-dev-border")}>{i.done ? "✓" : ""}</span>
                <span className={i.done ? "text-dev-muted line-through" : ""}>{i.name}</span>
              </button>
              <button aria-label={"Delete " + i.name} className="flex size-11 items-center justify-center text-dev-muted" onClick={() => remove(i)}>
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      );
    }
`;

/** Where the skill lives in the box, relative to the Dev's folder. */
export const APPS_SKILL = "skills/dev-sketches/SKILL.md";
/** Where it lived when sketches were apps; removed so a Dev never reads two. */
const OLD_APPS_SKILL_DIR = "skills/dev-apps";

/** Writes the sketches skill into the Dev's folder, replacing whatever is there. */
export function writeAppsSkill(agentDir: string) {
	rmSync(join(agentDir, OLD_APPS_SKILL_DIR), { recursive: true, force: true });
	const path = join(agentDir, APPS_SKILL);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, SKILL);
	return path;
}
