---
capability: capability-slug
title: Capability title
status: current
direction_objectives:
  - PD-CAP-DOMAIN-PRODUCT-001
---

# Capability title

## Purpose

Describe the externally observable capability and its intended consumers.

## Scope

### Supported

- State the supported journey boundary.

### Excluded

- State nearby behavior that is proposed, incidental, or owned elsewhere.

## Requirements

### REQ-DOMAIN-001 — Requirement title

The system MUST state one intentional, observable compatibility promise.

#### Scenario: Observable outcome

- GIVEN a supported starting state
- WHEN the user or Agent performs the supported action
- THEN the documented outcome occurs

##### Evidence

- Owner: `packages/owner/src/file.ts`
- Verification: `packages/owner/test/file.test.ts` — `focused test name`

### REQ-DOMAIN-002 — Supported behavior with a verification gap

The system MUST describe only behavior confirmed by implementation evidence.

#### Scenario: Current supported path

- GIVEN a supported starting state
- WHEN the supported action occurs
- THEN the current contract is observable

##### Evidence

- Owner: `packages/owner/src/other-file.ts`
- Verification: gap — Name the exact missing executable evidence.
