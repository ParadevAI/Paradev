from pathlib import Path
from html import escape
import collections.abc
import json

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

ROOT = Path(__file__).parent
OUT = ROOT / "paradev-workflows"
OUT.mkdir(exist_ok=True)
SOURCES = {
    "review": ("The Home: live Cloud PR review automation and prompt", "CLI: superset automations get / prompt get 6ee4b6a9-3296-4caa-9f82-429c542c4854"),
    "cleanup": ("Live review cleanup automation and prompt", "CLI: superset automations get / prompt get 249664f9-911e-4e4b-a3c2-130b48dc5809"),
    "upload": ("Photo-upload investigation and proposed fix, PR #9675", "https://github.com/ParadevAI/Paradev/pull/9675"),
    "uploadreview": ("The Home's review, including simulator evidence and host gap", "https://github.com/ParadevAI/Paradev/pull/9675#issuecomment-6830979122"),
    "martin": ("Martin's report, Coda's investigation and follow-up", "https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794501902030769"),
    "martindone": ("Coda reports root cause and hands PR to Harshith", "https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794505156233979"),
    "scope": ("Customer discussion and human scope correction", "https://paradev-ai.slack.com/archives/C0CEJPMM39N/p1794329071904259"),
    "scopepr": ("PR #9594: scoped fix and review iterations", "https://github.com/ParadevAI/Paradev/pull/9594"),
    "notice": ("Coda hands off a UI change with a before/after page", "https://paradev-ai.slack.com/archives/C0CGF7L3SJF/p1794453460128539"),
    "filter": ("The Home catches an OR/AND interaction in PR filtering", "https://paradev-ai.slack.com/archives/C0A5XPN6KUY/p1794507185458059"),
    "auth": ("The Home finds adjacent gaps in an auth fix", "https://paradev-ai.slack.com/archives/C0A5XPN6KUY/p1794505114220069"),
    "automation": ("Automation contract at workspace HEAD", "https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/docs/content/docs/automations.mdx"),
    "webhook": ("Webhook implementation at workspace HEAD", "https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/apps/api/src/app/api/automations/webhook/%5BautomationId%5D/route.ts"),
    "doctor": ("Dev doctor workflow instructions at workspace HEAD", "https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/.agents/skills/dev-doctor/SKILL.md"),
    "doctorlive": ("Live enabled Dev doctor incident schedule", "CLI: superset automations get c867e5db-6977-4ac6-b821-9de453f33654"),
    "tooling": ("Workspace and session control conventions", "https://github.com/ParadevAI/Paradev/blob/e5bac946514183a63bc95a7f47ad3193f5a19e3b/docs/agent-tooling.md"),
}


def slide(kicker, title, sub, cards=(), takeaway="", notes="", sources=(), dark=False):
    return dict(kicker=kicker, title=title, sub=sub, cards=cards, takeaway=takeaway,
                notes=notes, sources=sources, dark=dark)


SLIDES = [
    slide("PARADEV / FIELD NOTES / 12 NOV 2026", "The software factory\nis already running.",
          "Inside the workflows we use to build Paradev.",
          [("01", "Customers talk to agents"), ("02", "Agents hand work to agents"), ("03", "People inspect the evidence")],
          "The unit of work is becoming a whole feedback loop.",
          "Working draft for a 15–20 minute internal talk. The closing request in the previous chat asked for slides on real Paradev workflows. This deck prioritizes primary internal examples over the earlier literature dump. No performance uplift is inferred from these selected examples. All live-state checks are dated November 12, 2026.",
          ["review", "martin"], True),
    slide("THE THESIS", "The interesting change\nis between the prompts.",
          "A coding assistant helps with a task. An operating workflow carries it across tools and people.",
          [("Signal", "A customer report, review request, alert or schedule"),
           ("Execution", "A workspace with code, tools and an agent"),
           ("Evidence", "A PR, a report and an explicit human handoff")],
          "Each handoff needs context, ownership and an observable result.",
          "This is an interpretation of the examples, not a claim of full autonomy. Use the pipeline to orient the audience before the concrete cases. The integration/event layer can start work without someone copying text into a new chat.",
          ["automation", "tooling"]),
    slide("CASE 01 / THE HOME", "Our reviewer gets\na computer, too.",
          "The Home is a configured cloud workflow with instructions to inspect behavior at the PR head.",
          [("Trigger", "Assignment or review request to superset-home; selected authors"),
           ("Inspect", "Read the diff, surrounding code, discussion and CI"),
           ("Exercise", "Run changed surfaces and capture evidence, or name the gap")],
          "The review can include running the app, not just reading the patch.",
          "Verified from the live enabled Cloud PR review automation and its prompt. It uses Claude and a cloud environment. Assignment and review-request triggers filter to four actor IDs; a separate opened trigger selects Andrew Bastin. Do not describe it as reviewing every PR. The prompt checks the current PR head and directs checkout if needed. It requests screenshots or video for UI changes and command output for CLI/API work; this is required behavior, not proof every run achieves it.",
          ["review"]),
    slide("THE REVIEW ARTIFACT", "A verdict comes with\nsomething you can inspect.",
          "One report connects the change, the evidence and the workspace where it was checked.",
          [("Report", "Summary, findings, evidence, questions and test notes"),
           ("Delivery", "A GitHub comment and a reply in the PR’s Slack thread"),
           ("Lifecycle", "Sleep after the report; cleanup on PR merge or close")],
          "A person can follow the links and continue the investigation.",
          "The prompt asks for a published Paradev page with PR and review-workspace links and sets it as the workspace description. It explicitly forbids pushing, merging or submitting an approval/review; it posts a comment. Repeat runs should update the prior comment and page, not repeat notifications. Sleep ends the run's processes. The separate enabled cleanup automation selects matching review workspaces when a PR merges or closes and checks that it was not reopened. These are configuration facts, not an audit of all executions.",
          ["review", "cleanup"]),
    slide("WHAT IT FINDS", "Useful review lives\nin the interactions.",
          "Two recent findings show what a second agent can contribute.",
          [("PR #9678", "A reviewer filter worked alone, but combined with another filter it widened the results."),
           ("PR #9677", "An auth fix missed adjacent interactive subcommands and a similar OpenCode path.")],
          "These are concrete findings; they are not a measured reviewer accuracy rate.",
          "Both examples are The Home's Slack summaries linked to full review pages. For #9678 the stated defect was OR instead of narrowing with Awaiting review from you or your team. For #9677 the reviewer reported missing claude gateway/ultrareview and codex app-server cases and the same opencode auth login bug. We did not rerun these reports in this slide-building session. Avoid claiming that every reported finding was ultimately valid or fixed.",
          ["filter", "auth"]),
    slide("CASE 02 / HARSHITH’S CODA + MARTIN", "The customer’s thread\nbecomes the work queue.",
          "Martin reports a photo upload that hangs across Wi-Fi and mobile data.",
          [("Recognize", "Coda matches the report to SUPER-3442 instead of filing another copy."),
           ("Investigate", "Avi asks for a deeper debug; Coda opens a cloud session."),
           ("Return", "Coda posts the root cause, PR and evidence back to the thread.")],
          "Customer → Coda → coding session → The Home → Harshith.",
          "Martin is the customer in #ext-martin; Coda identifies itself as Harshith's assistant. The historical phrasing could be read ambiguously, but the retrieved evidence supports this relationship. On Nov 12 Coda linked an existing bug at 08:45 PST, posted the new investigation session at 08:48, and reported back at 09:39. This elapsed thread timeline is not an estimate of engineering time saved. No messages were sent during this research.",
          ["martin", "martindone"]),
    slide("THE BUG UNDERNEATH", "It looked like a network bug.\nIt was a state-machine bug.",
          "The attachment entered an “uploading” state that the host path never settled.",
          [("Before", "Adding a photo seeded progress = 0. The host uploads at send time, so Send stayed disabled."),
           ("Proposed fix", "Create upload state when an upload actually begins. Adding a photo only adds the attachment.")],
          "PR #9675 was open and unmerged when checked.",
          "Primary source: PR #9675, head b2d50134c4d4190e4a007a9d47070b9e5d98072f. The author connected addAttachments, startAttachmentUploads and the composer isUploading state. The PR reports 312 removals / 387 attachment-added events on build 140, but that selected telemetry is not an independently validated causal estimate and is intentionally absent from the slide. The author reports a regression test failing on base and 263 passing mobile tests. Those are author/reviewer reports; we did not execute this code today. Do not say the fix has shipped.",
          ["upload", "uploadreview"]),
    slide("THE HONEST BOUNDARY", "The reviewer said\nwhat it could not verify.",
          "The Home checked tests and the cloud attachment path, then named the missing host environment.",
          [("Checked", "The review reports a failing-on-base regression test and an unchanged cloud path in the simulator."),
           ("Still missing", "The host-workspace composer could not be checked in the app: no live relay or host-service.")],
          "A review can be useful while the affected end-to-end path remains unverified.",
          "Read the actual superset-home comment, not just Coda's shorter 'reviewed, looks good' summary. The comment says tests passed, a base regression was demonstrated, and cloud attachment behavior was exercised on an EAS simulator. It explicitly says the host composer was not verified in the app because the host was offline in the sandbox. This gap survives a positive code-review verdict and is important for the merge decision.",
          ["uploadreview"]),
    slide("CASE 03 / SCOPE IS STILL A HUMAN JOB", "Coda can carry the thread.\nPeople still set the boundary.",
          "A tooltip bug expanded into a request for multiple PRs and merge progress.",
          [("Customer asks", "Remove the overlapping tooltip and show all session PRs."),
           ("Human redirects", "Satya separates the multi-PR feature into a high-priority ticket."),
           ("Agent responds", "Coda files SUPER-3380; PR #9594 keeps the narrower fix.")],
          "Keeping work small is part of operating the loop.",
          "The Nov 10 Slack thread records the expansion and correction. The live PR body confirms the multi-PR feature is out of scope and describes multiple review iterations on stale PR history. PR #9594 was still open and unmerged when fetched. This is evidence of active coordination, not unattended shipping. Use this case to show how human judgment enters a working automation loop.",
          ["scope", "scopepr"]),
    slide("THE PLATFORM UNDER THE EXAMPLES", "Events can start\nreal workspaces.",
          "Automations connect an incoming event to an agent, context and somewhere to run.",
          [("Inputs", "GitHub, Slack, Linear, Sentry, Notion, Teams, schedules and raw webhooks"),
           ("Routing", "Choose a project, local device or cloud environment, and an agent"),
           ("Continuity", "Start fresh, reuse a workspace, or continue the prior conversation")],
          "The output is a workspace a teammate can open and continue.",
          "Capabilities verified in the workspace's automation documentation. Event metadata and capped payload precede the prompt. The live review automation starts fresh cloud runs; reuse and continue are platform options rather than descriptions of that particular configuration. Run history records dispatch state, and an offline local device can miss a run. Do not imply successful agent completion from a created workspace.",
          ["automation", "review"]),
    slide("WEBHOOKS / THE UNIVERSAL INPUT", "Anything that can POST\ncan call in an agent.",
          "A deploy script, CI job or internal tool can pass structured context into an automation.",
          [("Send", "POST JSON with a bearer token to the automation’s webhook URL"),
           ("Receive", "The authenticated payload enters the automation event pipeline"),
           ("Act", "An agent receives the event details before its task prompt")],
          "Example to build: failed deploy → investigate → evidence + proposed fix.",
          "The failed-deploy chain is an illustrative recipe, not a verified deployed Paradev automation. Read the actual route: POST /api/automations/webhook/{automationId}, token via bearer header or query string, JSON object or array, 300 requests/minute per presented token. Each authenticated delivery is a new event with no dedupe. A 200 response can return runs: 0; it does not mean work completed. The deck shows no real webhook URLs or tokens.",
          ["webhook", "automation"]),
    slide("CASE 04 / DEV DOCTOR", "The system has\na loop for its own failures.",
          "A scheduled agent is instructed to turn recurring Dev failures into durable fixes.",
          [("Observe", "Gather failed turns, retries, lost work and production evidence"),
           ("Understand", "Group by cause, check existing tickets, keep a shared notebook"),
           ("Encode", "A repeated repair becomes a reconciler rule or a code fix")],
          "The instructions say: the same fix a third time belongs in code.",
          "Verified: enabled Dev doctor: incidents automation scheduled hourly at minute 17; a separate architecture automation and prompt exist. Read .agents/skills/dev-doctor/SKILL.md as a source, not as instructions to execute here. Its prescribed workflow uses a Linear notebook, deduplicated causes, SELECT-only production investigation and draft PRs for clear small fixes. The spec says to skip incident gathering until the expected Devs v2 schema exists. We did not inspect run history or validate that any specific repair was learned. Therefore this slide describes the configured loop and its policy, not a measured self-improvement result.",
          ["doctor", "doctorlive"]),
    slide("WHAT “SELF-IMPROVING” MEANS HERE", "Three kinds of improvement.\nThree different claims.",
          "The evidence is strongest for faster feedback and explicit operational learning.",
          [("Product", "Reports become proposed fixes, with evidence and review."),
           ("Process", "Recurring failures can change code, prompts and recovery rules."),
           ("Model", "These workflows provide no evidence of model-weight improvement.")],
          "A useful system can improve its operating process without training a new model.",
          "Analytical distinction, grounded in the cases. The cases show proposed product changes and a configured process for learning. They do not establish recursive capability gains or autonomous model training. The previous literature page exists alongside this deck, but its external quantitative claims were not revalidated in this session and are not carried into these slides.",
          ["upload", "doctor"]),
    slide("WHAT TO MEASURE NEXT", "Count completed outcomes\nand the cost of getting there.",
          "Instrument the whole loop before claiming a productivity multiplier.",
          [("Delivery", "Report → proposed fix → reviewed merge → successful use"),
           ("Quality", "Verified findings, rework, reverts and escaped defects"),
           ("Cost", "Human attention, model spend and workspace runtime per outcome")],
          "A started workspace is a dispatch result. A working fix is a product result.",
          "Proposed measurement plan. No such end-to-end dataset was collected here. The automation documentation explicitly says a successful run means a workspace was created and does not track whether the agent's work succeeded. Account for duplicated dispatches, webhook retries, open PR queues and verification gaps. Use matched cohorts or controlled comparisons before attributing improvements to agents.",
          ["automation"]),
    slide("THE TAKEAWAY", "Build the feedback loop\nyou can actually inspect.",
          "Paradev already connects customer context, coding sessions, review evidence and human decisions.",
          [("Start with a signal", "Put work where the context already lives."),
           ("Make evidence travel", "Return a PR, a report and the limits of the check."),
           ("Keep an owner", "Someone owns scope, the merge and the result in production.")],
          "That is the software factory worth showing.",
          "Close on what the internal examples demonstrate, rather than on external benchmark scores. Suggested live demo: open the Martin thread, PR #9675 and the Home review comment side by side. Then show the Cloud PR review automation and its prompt. These links can change; the cited state is November 12, 2026.",
          ["review", "martin", "uploadreview"], True),
]

BG = "F3F1EA"
INK = "202D2A"
ACCENT = "C8663E"
MUTED = "65716A"


def build_html():
    sections = []
    for n, s in enumerate(SLIDES, 1):
        cards = ''.join(f'<article><span class="card-label">{escape(a)}</span><p>{escape(b)}</p></article>' for a, b in s['cards'])
        refs = ' · '.join(f'<a href="{escape(SOURCES[k][1])}">{escape(SOURCES[k][0])}</a>' if SOURCES[k][1].startswith('https:') else escape(SOURCES[k][0]) for k in s['sources'])
        sections.append(f'''<section class="slide {'dark' if s['dark'] else ''}" id="s{n}" aria-label="Slide {n}">
<div class="kicker">{escape(s['kicker'])}</div><h1>{escape(s['title']).replace(chr(10), '<br>')}</h1>
<p class="sub">{escape(s['sub'])}</p><div class="cards" style="--count:{len(s['cards'])}">{cards}</div>
<p class="takeaway">{escape(s['takeaway'])}</p><footer><span>PARADEV / WORKFLOWS IN PRACTICE</span><span>{n:02} / {len(SLIDES):02}</span></footer>
<aside class="notes"><strong>Speaker notes</strong><p>{escape(s['notes'])}</p><p class="sources">{refs}</p></aside></section>''')
    html = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Paradev — The software factory is already running</title>
<style>
*{box-sizing:border-box} :root{font-family:Arial,Helvetica,sans-serif;color:#202d2a;background:#dedfd8}body{margin:0}
.slide{position:relative;width:1280px;height:720px;padding:48px 66px;background:#f3f1ea;display:flex;flex-direction:column;overflow:hidden;transform-origin:top left}
.slide:before{content:"";position:absolute;right:66px;top:48px;width:26px;height:26px;background:#c8663e;border-radius:50%}
.kicker{font-size:12px;font-weight:700;letter-spacing:2px;color:#637269;margin-bottom:27px;padding-right:50px}
h1{font-family:Georgia,'Times New Roman',serif;font-size:62px;font-weight:400;line-height:1.1;letter-spacing:-2px;margin:0 0 18px;max-width:1120px}
.sub{font-size:21px;line-height:1.4;margin:0;max-width:1040px;color:#57665e}
.cards{display:grid;grid-template-columns:repeat(var(--count),1fr);gap:22px;margin-top:32px}
article{border-top:2px solid #c8663e;padding:16px 18px 12px 0;min-height:145px}.card-label{font-size:14px;font-weight:700;color:#ae502e;letter-spacing:.3px}article p{font-size:21px;line-height:1.35;margin:12px 0 0}
.takeaway{font-size:20px;font-weight:600;line-height:1.35;margin:auto 0 28px;max-width:1100px}
footer{display:flex;justify-content:space-between;font-size:10px;letter-spacing:1.6px;color:#637269;border-top:1px solid #ccd0c7;padding-top:15px}
.dark{background:#202d2a;color:#f3f1ea}.dark .kicker,.dark footer{color:#b6c5ba}.dark .sub{color:#c4d0c5}.dark .card-label{color:#efa782}.dark footer{border-color:#4c5c52}
.notes{display:none}body.notes-on .slide{height:auto;min-height:720px;overflow:visible}body.notes-on .notes{display:block;margin-top:28px;padding:20px 0;border-top:1px solid #a7b0a6;font-size:17px;line-height:1.55}.sources{font-size:13px}a{color:inherit;text-underline-offset:3px}
.toolbar{position:fixed;bottom:10px;right:12px;display:flex;align-items:center;gap:6px;background:#fffefaee;border:1px solid #c4c9be;padding:6px;border-radius:8px;z-index:10;font-size:12px;color:#202d2a}button{border:0;background:transparent;padding:7px 10px;color:inherit;cursor:pointer}button:hover{background:#e6e9df}button:focus-visible{outline:2px solid #c8663e}
body.present .slide{display:none}body.present .slide.active{display:flex}body.present{overflow:hidden}body:not(.present) .slide{margin:24px auto}
@media print{@page{size:13.333in 7.5in;margin:0}body{background:white}.toolbar{display:none!important}.slide,body.present .slide,body:not(.present) .slide{display:flex!important;width:13.333in;height:7.5in;margin:0;break-after:page;transform:none!important;zoom:1!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}.notes{display:none!important}}
</style><body class="present">''' + '\n'.join(sections) + '''
<div class="toolbar" aria-label="Presentation controls"><button id="prev" aria-label="Previous slide">←</button><span id="counter" aria-live="polite"></span><button id="next" aria-label="Next slide">→</button><button id="notes">Notes (N)</button><button id="overview">Overview (O)</button><button id="fullscreen">Full screen</button></div>
<script>
const slides=[...document.querySelectorAll('.slide')];let current=Math.min(slides.length-1,Math.max(0,(parseInt(location.hash.slice(2))||1)-1));
function resize(){const present=document.body.classList.contains('present');const scale=present?Math.min(innerWidth/1280,innerHeight/720):Math.min(1,(innerWidth-24)/1280);for(const s of slides){s.style.zoom=scale}if(present){const s=slides[current];s.style.marginLeft=Math.max(0,(innerWidth-1280*scale)/2)/scale+'px'}}
function show(n){current=Math.max(0,Math.min(slides.length-1,n));slides.forEach((s,i)=>{s.classList.toggle('active',i===current);s.style.marginLeft=''});document.getElementById('counter').textContent=(current+1)+' / '+slides.length;history.replaceState(null,'','#s'+(current+1));resize()}
function notes(){document.body.classList.toggle('notes-on');if(document.body.classList.contains('notes-on'))document.body.classList.remove('present');resize();slides[current].scrollIntoView()}
function overview(){document.body.classList.remove('notes-on');document.body.classList.toggle('present');show(current);slides[current].scrollIntoView()}
document.getElementById('prev').onclick=()=>show(current-1);document.getElementById('next').onclick=()=>show(current+1);document.getElementById('notes').onclick=notes;document.getElementById('overview').onclick=overview;document.getElementById('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
addEventListener('keydown',e=>{if(e.target.closest('button,a'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(current+1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(current-1)}if(e.key==='Home')show(0);if(e.key==='End')show(slides.length-1);if(e.key.toLowerCase()==='n')notes();if(e.key.toLowerCase()==='o')overview()});addEventListener('resize',resize);show(current);
</script></body></html>'''
    (OUT / 'index.html').write_text(html)


def build_pptx():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    prs.core_properties.title = "The software factory is already running"
    prs.core_properties.subject = "Paradev workflows: The Home, Coda, automations and operational learning"
    prs.core_properties.author = "Paradev"

    def rgb(c):
        return RGBColor.from_string(c)

    def text(sl, x, y, w, h, value, size, color, font='Arial', bold=False):
        shape = sl.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = shape.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        for i, line in enumerate(value.split('\n')):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            p.text = line
            p.font.name, p.font.size, p.font.bold, p.font.color.rgb = font, Pt(size), bold, rgb(color)
            p.space_after = Pt(0)
        return shape

    def line(sl, x, y, w, color):
        shape = sl.shapes.add_shape(1, Inches(x), Inches(y), Inches(w), Inches(.018))
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(color)
        shape.line.fill.background()

    for n, s in enumerate(SLIDES, 1):
        sl = prs.slides.add_slide(prs.slide_layouts[6])
        dark = s['dark']
        fg, muted = (BG, 'C4D0C5') if dark else (INK, MUTED)
        sl.background.fill.solid()
        sl.background.fill.fore_color.rgb = rgb(INK if dark else BG)
        dot = sl.shapes.add_shape(9, Inches(12.38), Inches(.5), Inches(.27), Inches(.27))
        dot.fill.solid()
        dot.fill.fore_color.rgb = rgb(ACCENT)
        dot.line.fill.background()
        text(sl,.69,.5,11.3,.25,s['kicker'],10,muted,bold=True)
        text(sl,.69,1.03,12,1.65,s['title'],46,fg,'Georgia')
        text(sl,.69,2.78,11.6,.75,s['sub'],16,muted)
        count = len(s['cards'])
        width = (11.95 - .24*(count-1))/count
        for i, (label, body) in enumerate(s['cards']):
            x = .69 + i * (width+.24)
            line(sl,x,3.75,width,ACCENT)
            text(sl,x,3.94,width-.10,.32,label,12,'EFA782' if dark else 'AE502E',bold=True)
            text(sl,x,4.43,width-.15,1.3,body,17,fg)
        text(sl,.69,6.22,11.95,.65,s['takeaway'],16,fg,bold=True)
        line(sl,.69,6.99,11.95,'4C5C52' if dark else 'CCD0C7')
        text(sl,.69,7.14,10,.18,'PARADEV / WORKFLOWS IN PRACTICE',8,muted)
        text(sl,11.85,7.14,.8,.18,f'{n:02} / {len(SLIDES):02}',8,muted)
        source_notes = '\n'.join(f'{SOURCES[k][0]}\n{SOURCES[k][1]}' for k in s['sources'])
        sl.notes_slide.notes_text_frame.text = s['notes'] + '\n\nSOURCES\n' + source_notes
    prs.save(OUT / 'paradev-workflows.pptx')


def build_notes():
    lines = ['# Paradev workflows — presenter notes', '',
             'Draft for a 15–20 minute internal talk. Checked November 12, 2026.', '',
             'Open index.html for the slide deck. Arrow keys navigate; N shows notes; O shows all slides. Print to save a PDF. The PowerPoint file contains editable text and speaker notes.', '',
             'Evidence classes: live configuration establishes intent; source code establishes a contract; a PR or reviewer report records a claim about a run. This session did not rerun the underlying workflow cases. PRs #9675 and #9594 were open and unmerged when checked.', '']
    for i, s in enumerate(SLIDES,1):
        lines += [f'## {i:02}. ' + s['title'].replace('\n',' '), '', s['sub'], '', s['notes'], '', 'Sources:', '']
        for k in s['sources']:
            name, url = SOURCES[k]
            lines.append(f'- [{name}]({url})' if url.startswith('https:') else f'- {name}: `{url}`')
        lines.append('')
    lines += ['## Remaining questions for a later revision', '',
              '- Audience and length were not specified; this version assumes an internal technical talk.',
              '- The evidence identifies Martin as the customer and Coda as Harshith’s assistant. If “Martin” meant a separate named agent, that example still needs a source.',
              '- No success rate, measured productivity uplift or end-to-end learning history was collected.',
              '- The existing self-improving-software-factory.html is prior research, not a newly verified source. Its quantitative claims were not imported into this deck.',
              '- Suggested demo tabs: the Martin thread, PR #9675, The Home’s GitHub comment and the Cloud PR review prompt.', '']
    (OUT / 'presenter-notes.md').write_text('\n'.join(lines))
    (OUT / 'slides.json').write_text(json.dumps(dict(slides=SLIDES, sources=SOURCES), indent=2, ensure_ascii=False)+'\n')


if __name__ == '__main__':
    build_html()
    build_pptx()
    build_notes()
    print(f'Built {len(SLIDES)} slides in {OUT}')
