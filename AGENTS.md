# Aperio Execution Spec

## Purpose
This file defines **what to build**, **how to build it**, and **what NOT to build** for the Aperio project.
It is the authoritative guide for the coding agent.

---

## System Overview (Ground Truth)

Aperio is a **censorship-resistant repository platform**.

- Git → manages code and history (OFF-CHAIN)
- CLI → orchestrates actions (user interface)
- Bulletin → stores artifacts (bundles)
- Contract → defines canonical truth (HEAD, proposals, releases)

> The blockchain does NOT store code. It stores decisions.

---

## Core Invariants (DO NOT VIOLATE)

1. **Single branch only**: `main`
2. **HEAD = canonical commit**
3. **Merges happen OFF-CHAIN (Git)**
4. **Contract records only the final result**
5. **Artifacts are Git bundles**
6. **CID identifies stored artifact bytes**
7. **Releases point to accepted commits only**
8. **Reviewer NEVER modifies code**
9. **CLI NEVER holds private keys** // In the ideal case working with the triangle
10. **On-chain stores pointers, not data**

---

## Data Flow (Authoritative)

```
Git → Bundle → Upload → CID → Contract → HEAD
```

- Bundle = artifact
- CID = storage locator
- Contract = canonical pointer

---

## Roles (STRICT)

### Contributor
- creates commit
- creates bundle
- submits proposal

### Reviewer
- fetches bundle
- inspects code
- approves/rejects ONLY

### Maintainer
- merges in Git
- resolves conflicts
- submits final commit

---

## Non-Goals (DO NOT IMPLEMENT)

- multi-branch support
- on-chain merge logic
- full git server
- CI/CD systems
- binary release pipelines

---

## Implementation Priorities

### Phase 1 — Contract
- repo registry
- proposals
- reviews
- HEAD pointer
- release registry

### Phase 2 — CLI
- propose
- fetch
- review
- merge
- release

### Phase 3 — Integration
- bundle creation
- Bulletin upload
- CID handling

### Phase 4 — DX polish
- UX messages
- wallet integration
- error handling

---

## Artifact Rules

- use Git bundles
- prefer full snapshot bundles (MVP)
- bundle must reconstruct repo state
- commit hash must match bundle contents

---

## Merge Model

Two cases:

### No conflict
- final commit = proposed commit

### Conflict
- maintainer merges locally
- creates new commit
- submits new bundle

---

## Release Model

- release = (version, commit, CID)
- commit must be canonical
- release does NOT change HEAD

---

## CLI Behavior

CLI must:

- infer repo state automatically
- generate bundle
- upload artifact
- request wallet signature
- submit transaction

---

## Security Rules

- no private key storage // in the ideal case not the MVP
- only request signatures
- all critical actions require confirmation

---

## Coding Rules

### Commit discipline
- one logical change per commit
- Conventional Commits required

### Separation
- do not mix:
  - logic + refactor
  - logic + docs
  - logic + formatting

### Code changes
- minimal diff
- no unrelated edits
- preserve structure

---

## Anti-Patterns

- storing code on-chain
- implementing Git logic
- adding extra abstractions
- introducing unnecessary configuration
- overengineering features

---

## Objective

Build a **minimal, correct, and clean implementation** of:

- proposal → review → merge → release

with:
- strong invariants
- simple architecture
- excellent developer experience

---

## Final Mental Model

- Git builds state
- CLI orchestrates
- Contract selects truth
- Bulletin stores data

> Keep it simple. Keep it correct. Do not drift from the model.
