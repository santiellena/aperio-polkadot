# CONTRIBUTING

## Overview

This repository follows a **clean, structured, and review-friendly workflow** inspired by Parity's engineering practices.

The goal is:
- clear history
- easy reviewability
- meaningful commits
- reproducible changes

---

## Core Principles

1. One commit = one logical change  
2. Aperio's protocol model has one canonical branch: `main`
3. History must be readable as documentation  
4. Separate concerns (logic, refactor, docs, formatting)  

---

## Commit Convention

use **Conventional Commits**:

```
type(scope): short summary
```

### Types

- feat — new feature  
- fix — bug fix  
- refactor — code restructuring  
- docs — documentation  
- test — tests  
- chore — maintenance  
- build — tooling  

---

### Scopes

- contract  
- cli  
- bulletin  
- wallet  
- release  
- docs  
- tests  
- web  
- all
- spec

---

### Examples

```
feat(cli): implement propose command
fix(contract): validate base commit against head
refactor(contract): split proposal and repo storage
docs(spec): add release model section
```

---

## Working Branches

The Aperio protocol supports only `main`. Temporary local or PR branches may be used
as staging while developing this repository, but they must not be modeled as Aperio
repository branches.

If you use a temporary working branch, use this format:

```
type/topic
```

Examples:

```
feat/proposal-flow
fix/merge-logic
refactor/storage-layout
docs/cli-spec
```

---

## Workflow

1. Start from `main`
2. Use a temporary local or PR branch only if needed
3. Work locally with meaningful commits
4. Clean commit history if needed
5. Merge back into `main`

---

## Rules

- Do NOT mix refactor + feature in one commit  
- Do NOT include formatting-only changes with logic  
- Do NOT create large, unreviewable commits  

---

## Testing

- Every feature should include basic tests  
- Contract logic must be covered  
- CLI commands should be testable  

---

## Goal

Every commit should:
- explain itself
- be reversible
- be independently understandable
