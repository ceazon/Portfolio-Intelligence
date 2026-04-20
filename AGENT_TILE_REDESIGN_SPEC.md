# Agent Tile Redesign Spec

## Goal

Turn agent tiles from internal scoring widgets into user-facing contribution cards that explain:
1. what the agent is saying
2. why it is saying it
3. how it affects the final recommendation

## Problem with current tiles

Current tiles emphasize internal mechanics:
- raw normalized score
- raw confidence
- action bias labels
- weight delta labels
- story counts in news summaries

This is useful for debugging, but not ideal for user understanding.

## Design principles

1. **Meaning before mechanics**
   - Lead with verdict and interpretation.
   - Hide internal score language from the primary view.

2. **Contribution-focused**
   - Every tile should show how that agent affects the recommendation.

3. **Plain English**
   - Replace system labels like `bias increase` or `score +0.54` with human wording.

4. **News should summarize tone, not count**
   - Story count may exist in detail, but should not be the headline.

5. **Keep technical metrics available secondarily**
   - Confidence, score, and weight shift are still useful, but as supporting detail.

## Primary tile structure

Each tile should present:
- **Agent name**
- **Verdict headline**
- **Contribution label**
- **Short why**
- **One practical effect label**
- **Timestamp**

## Agent-specific interpretation

### Fundamentals
Primary headline examples:
- Fundamentals support the long case
- Fundamentals are mixed
- Fundamentals weaken the setup

Contribution labels:
- Strong positive contributor
- Moderate positive contributor
- Limited contributor
- Negative contributor

Practical effect labels:
- Supports adding modestly
- Supports current sizing
- Suggests caution on sizing
- Suggests reducing exposure

Why text should mention ideas like:
- profitability
- growth
- valuation
- balance-sheet quality

### News
Primary headline examples:
- Recent news tone is positive
- Recent news tone is mixed
- Recent news tone is turning cautious

Contribution labels:
- Strong near-term support
- Moderate near-term support
- Mixed near-term signal
- Negative near-term signal

Why text should summarize:
- overall tone
- major themes
- whether current coverage reinforces or weakens the thesis

Avoid leading with story count like:
- "5 stories found"

Story count and source count may remain in detail or evidence sections.

### Bear case
Primary headline examples:
- Bear case is limited right now
- Bear case is active but contained
- Bear case is materially pressuring the setup

Contribution labels:
- Small downside drag
- Moderate downside drag
- Material downside drag

Why text should describe:
- whether downside catalysts are dominant
- whether current risk is rising or contained
- what kind of risk is active

### Macro
Primary headline examples:
- Macro backdrop is supportive
- Macro backdrop is mixed
- Macro backdrop is risk-off

Contribution labels:
- Tailwind
- Mild tailwind
- Neutral backdrop
- Headwind

## Secondary detail labels

Keep these as compact detail chips, but make them more readable:
- `Confidence 75%` stays acceptable
- `Score +0.54` should become `Signal +0.54` if shown
- `Bias increase` should become `Supports adding`
- `Δ 1.5%` should become `Sizing effect +1.5%`

## UX recommendation

### Default visible content
- verdict
- contribution
- short why
- practical effect

### Secondary metadata row
- confidence
- optional signal
- optional sizing effect
- timestamp

## Success criteria

The redesigned tiles should let a user quickly answer:
- Is this agent helping or hurting the stock case?
- Why?
- Is the effect large or small?

The user should not need to understand the internal scoring system to get value.
