---
name: caremid-deploy-guardrail
description: User granted standing pull/push/deploy access for Caremid; still confirm before pushing to main
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 37d8e15d-63ee-4aef-ab97-56d488eb186c
  modified: 2026-09-06T14:05:22.519Z
---

On 2026-09-06 the user granted standing authorization for me to pull, push, and deploy Caremid ([[caremid-rotaapp]]) myself in future sessions.

**Why:** they want low-friction help managing the live app and don't want to be asked for routine git/deploy work.

**How to apply:** freely do reversible things (pull, npm install, local builds/type-checks, branches, reading logs, firing read-only checks). But because a push to `main` AUTO-DEPLOYS to live production (real care-scheduling software people depend on), show the exact diff/change and get a one-line "yes" before pushing to `main`. This is a confirmation, not a refusal — keep it to one line. Reverting a bad deploy is via `git revert` + push (see RECOVERY.md), never force-push.