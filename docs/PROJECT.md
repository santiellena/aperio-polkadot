# 🧾 Censorship-Resistant Repository Protocol (CRRP)

## Overview

This project implements a **censorship-resistant repository registry and coordination layer** using the Polkadot ecosystem.

It is **not a Git replacement**, but a system that:
- anchors repository state on-chain
- stores artifacts off-chain using content-addressed storage
- enables decentralized collaboration and incentives

The system replaces GitHub’s role as:
- canonical authority over repositories
- gatekeeper of contributions
- single point of failure for access and availability

---

## 🧠 Core Design Principles

### 1. Separation of Concerns

| Component        | Responsibility                              |
|------------------|----------------------------------------------|
| Git              | Version control (local)                      |
| Smart Contract   | Canonical state + coordination               |
| Bulletin Chain   | Artifact storage                             |
| Frontend / CLI   | UX + developer interaction                   |

---

### 2. Identity vs Availability

- **Commit Hash** → canonical repo state (truth)
- **CID** → artifact instance (availability)

---

### 3. Minimal Trust

- Contributors are permissionless
- Reviewers are delegated
- Maintainers define canonical state
- Treasury enforces incentives

---

## 🧑‍🤝‍🧑 Actors

### Contributor
- proposes changes

### Reviewer
- evaluates proposals

### Maintainer
- decides final state
- merges code

### Treasury
- distributes rewards

---

## 🔄 Contribution Flow

### Step 1 - Local Development

Standard Git:

```bash
git clone ...
git checkout -b feature
git commit
```

---

### Step 2 - Proposal

Contributor submits:

- base commit
- proposed commit
- bundle (artifact)
- CID

---

### Step 3 - Review

Reviewer:
- fetch bundle
- inspect using Git
- approve/reject (just this)

---

### Step 4 - Merge (Off-chain)

Maintainer:
- merges in Git
- resolves conflicts if needed
- creates final commit

---

### Step 5 - Acceptance (On-chain)

Maintainer submits:

- final commit
- final CID

Contract updates:
- HEAD → final commit

---

### Step 6 - Rewards

- contributor rewarded if merged
- reviewers rewarded if correct

---

## 📦 Artifact Model

### Bundle

A **bundle** is a Git package containing:
- commits
- objects
- references

Used to:
- reconstruct repo
- review changes

---

## 🗃️ Storage Model

### Bulletin Chain

Stores:
- bundles (artifacts)

Properties:
- CID-based
- renewable
- not permanent

---

## 🧠 Canonical State

Canonical state is:

```
HEAD → commit
commit → CID
```

Users:
- fetch CID
- reconstruct repo with Git

---

## 🔀 Merge Model

- merges happen OFF-CHAIN
- chain only records result

Two cases:

### No conflict
- HEAD = proposed commit

### Conflict
- maintainer merges
- HEAD = merged commit

---

## 🚀 Release Model

### What is a Release?

A **release** is a maintainer-declared **stable version** of the repository.

It represents:
- production-ready code
- versioned state
- publicly trusted snapshot

---

### Key Concepts

- **HEAD** → latest accepted commit
- **Release** → stable commit chosen by maintainer
- **Version** → human-readable label (e.g. v1.2.0)

---

### Properties

Each release stores:
- version string
- commit hash
- CID
- timestamp

---

### Rules

- A release MUST point to an already accepted commit
- Releases do NOT change HEAD
- Multiple releases can exist

---

### Example

```
HEAD → commit H

Releases:
v1.0.0 → commit A → CID_A
v1.1.0 → commit B → CID_B
v1.2.0 → commit H → CID_H
```

---

### Why Releases Matter

They allow users to:
- fetch stable code
- identify production versions
- debug specific versions
- avoid unstable HEAD state

---

### User Flow

1. Query latest release
2. Fetch CID
3. Reconstruct repo

---

## 🧾 Smart Contract

Stores:
- repos
- proposals
- reviews
- HEAD pointer
- CID pointer
- releases (version → commit → CID)

---

## 💰 Incentives

- contributor paid on merge
- reviewers paid if correct
- treasury funds storage

---

## ⚙️ Developer Experience

Flow:

```bash
git commit
git push polkadot main
→ sign tx
→ publish bundle
```

---

## 🧪 Dev Strategy

### Phase 1
- Solidity + EVM (REVM)

### Phase 2
- PolkaVM (PVM)
- debug + feedback

---

## 🧠 Final Model

- Git → builds state
- Contract → selects state
- Bulletin → stores state

---

## 🎯 Summary

A system where:
- code is versioned with Git
- artifacts are stored off-chain
- canonical truth is decided on-chain
- stable releases are explicitly tracked
