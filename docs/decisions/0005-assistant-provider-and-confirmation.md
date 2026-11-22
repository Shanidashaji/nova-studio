# ADR-0005 — Assistant provider abstraction with confirm-before-write

**Status:** Accepted (2026-11-22)

## Context

NOVA AI must answer questions about live operations, suggest actions and accept voice input. No AI provider key may be available during the interview, and the assistant must never claim to have done something it has not done.

## Decision

- An `AssistantProvider` interface with two implementations:
  - **Demo provider** (default): deterministic intent recognition (patterns + fuzzy entity matching against projects, clients, people, stages) that calls the same read tools as the LLM provider and composes answers from live data.
  - **Claude provider** (when `ANTHROPIC_API_KEY` is set): the Anthropic Messages API with tool use over the same tool set.
- Tools are split into **read tools** (queries) and **propose tools**. Propose tools never write domain data; they create an `AssistantAction` with status `PROPOSED`, the exact payload and a human-readable preview.
- Execution happens only through `POST /assistant/actions/:id/confirm`, which re-checks permissions and staleness, calls the normal domain service, and writes an `ActivityLog` entry with `source = ASSISTANT`.
- The UI always shows which provider is active.

## Alternatives

- **LLM only** — the demo would break without a key or network.
- **Canned responses** — would not reflect real data and would not survive questions outside the script.
- **Let the model call write endpoints directly** — violates the confirm-before-write requirement.

## Consequences

- The assistant is useful offline and in demo mode, and improves when a key is configured.
- Every data change made through the assistant is previewed, confirmed, attributable and auditable.
