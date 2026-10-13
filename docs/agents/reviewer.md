# Master reviewer: review, merge, integrate

Runs in `~/secure` on `main`, after the four agents report done. You are the only one who writes to `main`, and the only one who may edit master-only files (see `docs/agents/workflow.md#2-ownership-the-core-rule`). Ports: web 3000, bio 8000, phish 3001.

**Read**: `AGENTS.md`, `docs/agents/workflow.md`, `docs/foundation.md`, `docs/security.md`, then each agent's brief (`docs/agents/{auth,bio,devices,recovery}.md`) on its branch, especially Handoff.

## 0. Preconditions
- `git status` on `main` is clean. `git branch` shows `agent/auth`, `agent/bio`, `agent/devices`, `agent/recovery`.
- Each branch's last commit is `chore(<agent>): handoff` (if not, the agent isn't done: tell the user which one, don't merge it).
- Collect every `REQUEST`, `BUG`, `DOC` line from the four Handoff sections into a list before merging anything: `git show agent/<x>:docs/agents/<x>.md`.

## 1. Per-branch review (before merging it)
For each branch, in merge order **auth → bio → devices → recovery**:

1. `git log --oneline main..agent/<x>` and `git diff --stat main...agent/<x>`.
2. `scripts/check-scope.sh <x> main agent/<x>` must print OK. Out-of-scope files: read the change; keep it only if it's clearly needed and harmless, otherwise drop it during merge and note it.
3. Shared file `web/src/server/config.ts`: `git diff main...agent/<x> -- web/src/server/config.ts` must only touch that agent's section.
4. Contract stubs: exported names/props/types unchanged (`git diff main...agent/<x> -- web/src/server/bio/liveness.ts web/src/components/bio web/src/components/recovery`); `web/src/server/auth/**` exports unchanged on `agent/auth`.
5. Security review of the diff against `AGENTS.md` hard rules and the `docs/security.md` PR checklist. Grep the branch for red flags:
   ```bash
   git diff main...agent/<x> | grep -nEi 'password|otp|magic.?link|console\.log|faceSim|scores|localStorage\.(set|get)Item\(.*(sid|token|code)'
   ```
   Every mutating route uses `route()` + zod + `requireSession` (or a binding cookie per `docs/api.md`); every auth action logs an event; no scores/codes/tokens/frames in responses or logs; liveness never creates a session.
6. If the branch is not acceptable: don't merge. Add a `## Review feedback` section to that agent's brief **on `main`** (commit `docs(review): feedback for <x>`), tell the user to relaunch that agent with "read Review feedback in your brief, then `git merge main` and fix". Continue with the other branches.

## 2. Merge
```bash
git merge --no-ff agent/<x> -m "merge: agent/<x>"
```
- Conflicts should only be in `web/src/server/config.ts` (keep both sections) or docs. Anything else means a scope violation: resolve by taking the owner's version.
- After EACH merge run the gates and fix on `main` before the next merge:
  ```bash
  cd web && pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
  cd ../bio && uv sync && uv run pytest        # once bio is merged
  ```
- Integration fixes are small commits on `main`: `fix(integration): ...`.

## 3. Resolve requests
Work through the collected `REQUEST` / `BUG` / `DOC` list. You may edit anything now. Schema changes: edit `schema.ts`, `pnpm db:generate`, commit the new migration. New error codes/events/env vars: update `http.ts` / `schema.ts` / `.env.example` and the docs together.

## 4. End-to-end verification on main
Real setup: `web/.env.local` with `ORIGIN=http://localhost:3000`, `BIO_URL=http://localhost:8000`, `DEBUG_RISK=1`, `RECOVERY_COOLDOWN_OVERRIDE_S=60`; `bio/.env` with the same `BIO_INTERNAL_TOKEN`; models downloaded. Start bio (8000), web (3000), phish (3001). Fresh DB (`pnpm db:reset`).

Walk the demo script in `docs/roadmap.md` and confirm each step, including the items the agents could not test alone:
- [ ] Sign-up with real passkey → face enrollment (step 3, `withReauth` path) → recovery code → `/home`.
- [ ] Sign in; Simulate location → step-up → photo/video fails, live passes; `/home` notification.
- [ ] Risky login with no face enrolled → blocked.
- [ ] `/security`: regenerate recovery code with stale reauth → passkey prompt → new code. Delete + re-enroll face.
- [ ] Device link by QR between two browsers/profiles; approve; new device signs in; remove old device; last-device protection; add a security key (virtual authenticator).
- [ ] Recovery with liveness (code_liveness) and without (code_only); banner + cancel on another session; complete after cooldown; old credentials revoked; new code shown.
- [ ] Admin: users, devices, events with risk signals, revoked list, revoke credential, cancel recovery.
- [ ] Phishing clone attacks 1–4 behave as `docs/phishing-demo.md` says; attack 3 visible in admin feed.
- [ ] `/threat-model` page renders; every page usable at 360 px with a working 🔊 button.

## 5. Close out
- Tick `docs/roadmap.md`, fix docs that drifted (`architecture.md`, `api.md`, `data-model.md`, `flows.md`), move agent Decisions worth keeping into the relevant doc's Decisions section.
- Optional: remove `pnpm dev:session` before submission or keep it documented as dev-only.
- Tell the user what works, what doesn't, and anything still open.
