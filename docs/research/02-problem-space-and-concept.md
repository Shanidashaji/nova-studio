# 02 — Problem Space and Product Concept

## 1. The problem

A small cinematic production studio usually runs on a patchwork: WhatsApp threads with clients, spreadsheets for budgets, a shared drive for footage, a calendar for shoots, a separate review tool for cuts, and memory for everything else. Each tool holds a fragment of the truth. Nobody can answer, in one place:

- What is in production right now, and at which stage?
- What is stuck, and why?
- Which client approval have we been waiting on longest?
- Is the A-cam free on Thursday, and is the DOP already booked?
- Who is overloaded next week?
- Are we burning budget faster than we are making progress?
- What is coming in through sales, and can we staff it?

## 2. Existing tool categories (and the gap)

| Category          | Examples                                              | Strength                                  | Gap for a small studio                                                             |
| ----------------- | ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| General ERP       | Odoo, SAP Business One                                | Accounting, HR, inventory                 | Department modules, no notion of a production lifecycle, shoots or revision rounds |
| Work management   | Asana, Monday, ClickUp                                | Tasks and boards                          | Task-centric; no deliverables, gear, approvals-as-workflow or budget burn          |
| Pre-production    | StudioBinder                                          | Call sheets, shot lists, shoot scheduling | Stops at the shoot; no post, approvals, sales or finance                           |
| Review & approval | Frame.io                                              | Frame-accurate feedback on cuts           | Only the review step; no link to schedule, crew or budget                          |
| Pipeline tracking | Autodesk Flow Production Tracking (formerly ShotGrid) | Deep VFX/animation pipelines              | Built for large pipelines; heavy for a ten-person studio                           |

**Gap:** nothing connects _sales → production → crew & equipment → client approvals → finance_ in one live model sized for a small studio. NOVA's thesis is that the production lifecycle itself should be the organising spine of the company's operating system.

## 3. Research that shapes the design

| Idea                                                                  | Source                                          | How NOVA applies it                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Situation awareness: perception → comprehension → projection          | Endsley (1995)                                  | The default **Pulse** view answers _what is happening_, _what it means_ (risk, blockers) and _what happens next_ (upcoming shoots, deadlines, projections). |
| "Overview first, zoom and filter, then details on demand"             | Shneiderman (1996)                              | Pipeline Spine (overview) → lenses and focus (zoom/filter) → Inspector drawer (details).                                                                    |
| Coordinated multiple views / brushing and linking                     | Visual analytics literature (e.g. Roberts 2007) | One **workspace focus**: selecting a stage, project, client or person filters every panel at once.                                                          |
| Flow metrics: WIP, cycle time, throughput (Little's Law)              | Lean / Kanban practice                          | Per-stage WIP, average dwell time and throughput on the Spine; workflow-efficiency analytics.                                                               |
| Theory of Constraints: the system moves at the pace of its bottleneck | Goldratt (1984)                                 | The stage with the worst WIP-to-capacity ratio is flagged as the current **constraint**.                                                                    |
| Mixed-initiative interfaces: the agent proposes, the human decides    | Horvitz (1999)                                  | NOVA AI never mutates data directly. It proposes an action with a preview; the user confirms; the action is logged.                                         |
| Keyboard-first command palettes                                       | Common in modern productivity tools             | `Ctrl/⌘ K` reaches every entity and every action.                                                                                                           |

## 4. The concept: one workspace, many lenses

NOVA is a single route (`/studio`). There are no department dashboards. The screen is made of five persistent parts:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Command bar  (Ctrl K · search · ask NOVA)              alerts · profile │
├────┬─────────────────────────────────────────────────────────────────────┤
│    │  PIPELINE SPINE   Brief ─ Pre-pro ─ Shoot ─ Edit ─ Review ─ Delivery │
│ L  │  counts · WIP · blockers · dwell time · constraint flag             │
│ E  ├──────────────────────────────────────────────┬──────────────────────┤
│ N  │                                              │                      │
│ S  │          WORKSPACE CANVAS                    │   INSPECTOR          │
│ E  │   (arrangement depends on active lens;       │   (context drawer    │
│ S  │    every panel obeys the workspace focus)    │    for any entity)   │
│    │                                              │                      │
│    │                                              │   NOVA assistant dock│
└────┴──────────────────────────────────────────────┴──────────────────────┘
```

1. **Pipeline Spine (always visible).** The six lifecycle stages as a connected flow. Each node shows active items, blockers and average dwell time. The current bottleneck is marked. Clicking a stage sets the workspace focus to that stage.
2. **Lenses.** Pulse, Productions, Schedule, People, Clients & Sales, Business, Activity. A lens is an _arrangement of shared panels over the same data and the same focus_, not a separate dashboard. Switching lens keeps the focus, the inspector, the spine and the assistant. Lens and focus are stored in the URL, so any view can be linked.
3. **Workspace focus.** A single piece of state — `{ type: stage | project | client | member | asset, id }` — that every panel reads. Focus a client and the productions list, the schedule, the revenue chart and the activity stream all narrow to that client. This is what makes the system feel like one connected thing.
4. **Inspector.** A right-hand drawer that can open any entity from anywhere: project, task, deliverable, shoot, person, client, asset. Inspectors stack with a breadcrumb (project → task → assignee), and primary actions happen inline: advance stage, approve, request changes, assign, book equipment, log a client interaction.
5. **Command layer and NOVA assistant.** The palette searches every entity and exposes every action. The assistant dock takes text or voice, knows the current focus, answers with linked entities, and turns requests that change data into confirmable proposals.

### The Attention Queue

The Pulse lens is led by a ranked, explainable list of things that need a decision: overdue deliverables, ageing client approvals, blocked tasks, equipment double-bookings, overloaded crew, budget burn ahead of progress. Every item shows _why it is there_ (the rule and the numbers) and the action that resolves it.

### Mapping requirements to the single workspace

| Requirement                                                           | Where it lives                                                                                           |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Operational overview, priorities, alerts, upcoming, pending decisions | Pulse lens + Attention Queue + Spine                                                                     |
| Projects, timeline, milestones, risks, client info                    | Productions lens + Project inspector                                                                     |
| Workflow stages, transitions, approvals, dependencies, history        | Spine + Project inspector (stage track, dependency graph, transition history) + workflow template editor |
| Tasks: create, edit, assign, status                                   | Project inspector, command palette, assistant                                                            |
| Shoot scheduling, equipment allocation, conflicts                     | Schedule lens + Shoot / Asset inspectors                                                                 |
| Team directory, workload, availability                                | People lens + Member inspector                                                                           |
| Clients, interactions, deliverables, sales pipeline                   | Clients & Sales lens + Client inspector                                                                  |
| Revenue, expenses, budgets, trends (demo)                             | Business lens + budget section in Project inspector                                                      |
| Analytics: flow efficiency, risk, utilisation                         | Spine metrics, Pulse insights, Business lens                                                             |
| Activity and audit trail                                              | Activity lens + per-entity history in every inspector                                                    |
| AI assistance, voice                                                  | Assistant dock (all lenses), palette "Ask NOVA"                                                          |

## 5. Demo journeys (interview script)

1. **Morning check.** Sign in → Pulse shows the Attention Queue → open "Client approval waiting 4 days" → inspector shows the deliverable, its revision round and feedback → log a follow-up call → the item drops in priority and the action appears in Activity.
2. **Move work through the pipeline.** Focus the Edit stage → open a project → try to advance to Review → NOVA blocks the transition and names the open task and its dependency → complete the task → advance → the transition is recorded and the Spine updates live.
3. **Plan a shoot.** Schedule lens → create a shoot → assign crew and equipment → NOVA flags that the A-cam is already booked that day → swap the body → conflict cleared.
4. **Ask NOVA.** "Which projects are at risk this week?" → answer with linked projects and reasons. "Create a colour-grade task for the brand film, due Friday, for the editor" → proposal preview → confirm → task created and logged as an assistant action.
5. **Business view.** Business lens (marked as demo data) → budget burn vs progress per project, sales pipeline by stage, revenue and expense trend; focus a client to see their share.

## 6. What NOVA is not

- Not a media asset manager or review player: previews are still frames, not footage.
- Not an accounting system: financial records support budget tracking and trends only.
- Not multi-tenant: one studio, one workspace.
