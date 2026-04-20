# Agent Output Contract

This document is the source of truth for the shared structured opinion format used by all recommendation agents in Portfolio Intelligence.

## Purpose

Every contributing agent must produce the same high-level shape of output so that:
- agents can be added incrementally without reworking the downstream pipeline
- the synthesizer can consume a stable contract
- the UI can render both summary and explanation consistently
- side-by-side validation with the legacy rules engine stays straightforward

This contract is intentionally opinionated and small. v1 should optimize for consistency, inspectability, and easy synthesis, not maximal detail.

## Design principles

1. **One agent, one opinion per scope per run**
   - Each agent writes a single structured opinion for the scope it covers.
   - Example scopes:
     - symbol-level: `AAPL`
     - global-level: macro posture

2. **Normalized outputs first, agent-specific richness second**
   - Every agent must emit the core shared fields.
   - Agents may also include richer evidence or metadata, but not instead of the shared fields.

3. **Advisory, not auto-trading**
   - The output is meant to guide judgment.
   - Conviction and thesis matter more than hard optimizer logic in v1.

4. **Readable by both machines and humans**
   - The same payload should support synthesis, debugging, and explanation UI.

## Required shared fields

Every agent output must contain these fields conceptually, regardless of implementation details:

- **agent_name**
  - Stable identifier for the agent.
  - Examples: `news-agent`, `macro-agent`, `fundamentals-agent`, `bear-case-agent`

- **scope_type**
  - The level the opinion applies to.
  - Allowed v1 values:
    - `symbol`
    - `global`

- **scope_key**
  - Stable key for the scope.
  - Examples:
    - symbol scope: ticker or symbol id
    - global scope: `global`

- **stance**
  - The directional opinion from the agent.
  - Allowed v1 values:
    - `bullish`
    - `neutral`
    - `bearish`
  - Macro agent may map its internal posture into this same scale for synthesis compatibility.

- **normalized_score**
  - Numeric directional score on a shared scale.
  - v1 scale: **-1.0 to 1.0**
    - `-1.0` = strongest negative view
    - `0.0` = neutral / mixed
    - `1.0` = strongest positive view

- **confidence_score**
  - How confident the agent is in its own opinion.
  - v1 scale: **0.0 to 1.0**
    - `0.0` = very low confidence
    - `1.0` = very high confidence

- **summary**
  - Short, plain-English summary of the opinion.
  - Target: 1 to 2 sentences.

- **thesis**
  - Slightly richer explanation of the reasoning.
  - Can be short paragraph form.

- **evidence**
  - Structured references to the specific evidence that supported the opinion.
  - The exact storage shape can evolve, but the semantic contract is fixed: outputs must be traceable to evidence.

## Optional shared fields

These are shared, but optional in v1 depending on the agent.

- **action_bias**
  - Advisory action lean.
  - Allowed v1 values:
    - `increase`
    - `hold`
    - `reduce`
    - `avoid`

- **target_weight_delta**
  - Suggested directional weight adjustment in percentage points.
  - Example: `+2.5`, `-1.0`
  - This is advisory only.

- **target_price**
  - Optional price target when the agent can support one credibly.
  - More relevant for synthesis or fundamentals-driven views than for macro.

- **time_horizon**
  - Optional horizon label for the opinion.
  - Suggested v1 values:
    - `short-term`
    - `medium-term`
    - `long-term`

- **risk_flags**
  - Optional list of notable risks or caveats.

## Canonical interpretation rules

To avoid drift, these meanings are locked:

### 1. Stance and score must agree
- `bullish` should correspond to a positive `normalized_score`
- `neutral` should correspond to a near-zero `normalized_score`
- `bearish` should correspond to a negative `normalized_score`

### 2. Confidence is not direction
- Confidence measures certainty, not positivity.
- A highly confident bearish call is valid.

### 3. Summary is the headline, thesis is the explanation
- `summary` should be what we can show in compact UI
- `thesis` should be what we can expand into detail UI or pass to synthesis context

### 4. Evidence must be inspectable
- Every material claim should be supported by evidence references where possible.
- If evidence is thin, confidence should generally be lower.

### 5. Target-weight suggestions are advisory overlays
- `target_weight_delta` should not be treated as a portfolio optimizer output.
- In v1 it is a directional signal for synthesis and UI explanation.

## v1 agent-specific expectations

### News Agent
Must emit:
- stance
- normalized_score
- confidence_score
- summary
- thesis
- evidence
- action_bias
- optional target_weight_delta

Interpretation:
- captures the current evidence-weighted narrative from recent news flow for a symbol

### Macro Agent
Must emit:
- scope_type = `global`
- scope_key = `global`
- stance
- normalized_score
- confidence_score
- summary
- thesis
- evidence

Interpretation:
- global market posture only in v1
- should influence synthesis across all symbols, but not erase strong symbol-specific evidence by default

### Fundamentals Agent
Must emit:
- stance
- normalized_score
- confidence_score
- summary
- thesis
- evidence
- optional action_bias
- optional target_weight_delta
- optional target_price

Interpretation:
- expresses medium- to long-horizon quality/valuation view from fundamentals snapshot data

### Bear Case Agent
Must emit the same shared contract.

Interpretation:
- specifically pressures the bullish narrative by surfacing downside risks, contradictory evidence, or fragility in the long thesis

### Synthesizer
The synthesizer is not just another raw input agent, but its output should still resolve to the same top-level opinion shape for consistency.

It should consume agent outputs and produce:
- final stance
- final normalized score
- final confidence score
- final summary
- final thesis
- final action_bias
- final target_weight_delta
- optional target_price
- evidence references back to contributing agent outputs and underlying research

## UI contract

This shared output contract supports a two-layer UI:

### Portfolio summary layer
Show only:
- Program Action
- Target Weight
- Conviction
- optional Target Price

### Explanation layer
Show:
- each contributing agent output
- each agent's stance, score, confidence, summary, thesis, and evidence
- final synthesis result and how inputs were weighed

## Non-goals for v1

The contract does **not** require:
- detailed agent-specific schemas for every data source
- exact DB table design in this document
- exact prompt format in this document
- optimizer-grade portfolio construction logic
- full autonomy or automatic execution

Those can evolve underneath this shared interface.

## Locked v1 recommendation

For implementation, treat the following as locked:

- shared directional scale: `normalized_score` in **[-1.0, 1.0]`
- shared confidence scale: `confidence_score` in **[0.0, 1.0]`
- shared stance vocabulary: `bullish | neutral | bearish`
- shared scope vocabulary: `symbol | global`
- shared action bias vocabulary: `increase | hold | reduce | avoid`
- all agents must emit the shared opinion core before we broaden the system further

## Implementation status

Implemented in code:

1. centralized TypeScript contract and conversion helpers
2. current agent writers normalized to the shared contract
3. synthesizer compatibility updated to consume normalized contract values
4. UI readers updated to display normalized score/confidence semantics
5. DB migration added at `supabase/014_normalize_agent_output_scores.sql` to convert legacy rows and enforce score ranges

## Practical next implementation step

Now that the contract is locked and wired through the current stack, the next coding step should be:

1. apply the normalization migration remotely
2. backfill any legacy rows in deployed environments
3. remove compatibility assumptions that still treat stored scores like 0-100 values
4. then refine synthesis weighting with the normalized contract as the only source of truth
