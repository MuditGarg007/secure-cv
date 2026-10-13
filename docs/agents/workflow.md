# Parallel agent workflow (STRICT)

Four agents build this project at the same time, each in its own git worktree and branch. A master reviewer merges everything into `main` at the end. These rules exist so the four branches merge with zero conflicts. **Breaking a rule here is worse than leaving a feature unfinished.**

## Team

| Agent | Brief (your task list) | Worktree | Branch | Web port | Other ports |
|---|---|---|---|---|---|
| A `auth` | `docs/agents/auth.md` | `~/secure-auth` | `agent/auth` | 3100 | |
| B `bio` | `docs/agents/bio.md` | `~/secure-bio` | `agent/bio` | 3200 | bio 8200 |
| C `devices` | `docs/agents/devices.md` | `~/secure-devices` | `agent/devices` | 3300 | |
| D `recovery` | `docs/agents/recovery.md` | `~/secure-recovery` | `agent/recovery` | 3400 | phish 3401 |
| master | `docs/agents/reviewer.md` | `~/secure` | `main` | 3000 | bio 8000, phish 3001 |

`main` already contains the **foundation** (M0): Next.js scaffold, all dependencies, the full DB schema + migration, env/config, error handling, sessions, WebAuthn ceremony helpers, recovery-code helpers, events, notifications, UI shell, and contract stubs. Read `docs/foundation.md` before writing code; use those helpers instead of writing your own.

## 1. Start of session (do all, in order)

1. `pwd` must be your worktree and `git branch --show-current` must be your branch. If not, STOP and tell the user.
2. Read: `AGENTS.md`, this file, `docs/foundation.md`, your brief, then every doc your brief lists under "Read".
3. `cd web && pnpm install && pnpm typecheck && pnpm test`. All must pass before you change anything. If the baseline fails, STOP and tell the user (foundation bug, master must fix).
4. `web/.env.local` is already created for your ports. Never commit it.

## 2. Ownership (the core rule)

- `scripts/owners.txt` lists the files each agent may create or edit. **You may only touch paths that match your globs.** Everything else is read-only for you, including files you think are "obviously" wrong.
- `web/src/server/config.ts` is shared: edit **only inside your own `===== <agent> =====` section**, append new constants at the end of that section, never reorder or touch other sections.
- Before **every** commit run `scripts/check-scope.sh <agent>` from the worktree root. It must print `OK`. If it lists `OUT OF SCOPE` files, revert them (`git restore <file>`, or delete the untracked file).
- Read-only for everyone (master-only): `web/package.json`, `web/pnpm-lock.yaml`, `web/pnpm-workspace.yaml`, `web/src/server/db/**`, `web/drizzle/**`, `web/src/server/{env,http,events,notifications,request-meta,crypto,users,recovery-code}.ts`, `web/src/lib/{api,voice,ua,utils,webauthn-client}.ts`, `web/src/components/{ui,common}/**`, `web/src/app/layout.tsx`, `web/src/app/globals.css`, config files in `web/`, `AGENTS.md`, `CLAUDE.md`, `scripts/**`, and every doc not listed in your globs (`architecture.md`, `api.md`, `data-model.md`, `flows.md`, `roadmap.md`, `foundation.md`, other agents' briefs).
- Agent A owns `web/src/server/auth/**`, which includes foundation files (`sessions.ts`, `webauthn.ts`, `challenges.ts`, `credentials.ts`). A may fix bugs there but **must not change any exported name, parameter or return type**: B, C and D depend on them.

## 3. Contracts between agents

You can't see other agents' work until the merge. Cross-agent dependencies go through **contract stubs** that already exist on `main` (files with a `CONTRACT STUB` header):

| Stub | Owner (replaces body) | Used by |
|---|---|---|
| `web/src/server/bio/liveness.ts` | B | B (step-up), D (recovery liveness) |
| `web/src/components/bio/FaceEnrollPanel.tsx` | B | A (sign-up step 3) |
| `web/src/components/bio/FaceSettings.tsx` | B | A (`/security`) |
| `web/src/components/bio/LivenessCheck.tsx` | B | B (`/signin/step-up`), D (`/recover/[id]`) |
| `web/src/components/recovery/RecoveryBanner.tsx` | D | A (`/home`) |
| `web/src/components/recovery/AdminRecoveryRequests.tsx` | D | C (admin user detail) |

Rules:
- **Owner**: replace the body, keep every exported name, prop, parameter and return type exactly. You may add new exports. You may add optional props only.
- **Consumer**: import and use the stub as if it were finished. Never edit it, never copy it. Until merge it renders a placeholder or throws `BIO_UNAVAILABLE`; that is expected. Handle `BIO_UNAVAILABLE` gracefully in your UI.
- HTTP endpoints owned by another agent (e.g. `/api/auth/reauth/*` used by `withReauth`) are called by URL per `docs/api.md`. Code against the doc. Don't stub them in your branch.
- If a contract is missing something you need: do NOT edit it. Work around inside your own files, and add a `REQUEST` line to the Handoff section of your brief (who, what, why). The master resolves it at merge time.

## 4. Git rules

- Commit only to your branch. Never commit to `main`, never touch another agent's branch or worktree, never run `git worktree`, `git merge`, `git rebase`, `git cherry-pick`, `git reset --hard origin/...`, `git push --force`, or `git config` changes. Exception: when the master's feedback tells you to `git merge main`, do exactly that.
- Small commits, one logical change each, Conventional Commits with your agent as scope: `feat(auth): login verify with risk check`, `test(recovery): state machine edges`, `docs(bio): calibrated thresholds`.
- Stage explicitly (`git add <paths>`); no blind `git add -A` / `git add .`. Check `git status` first.
- Every commit must pass: `scripts/check-scope.sh <agent>`, `cd web && pnpm typecheck && pnpm lint && pnpm test` (lint: no errors). B also runs `cd bio && uv run pytest`. Never commit a red build; never use `--no-verify`.
- Commit at least after every finished checklist item in your brief. Don't sit on uncommitted work.
- If `git remote` shows an `origin`, run `git push -u origin <your-branch>` after each commit. If not, skip pushing: the worktrees share one repo, so the master already sees your commits.
- Never commit: `.env*` (except `.env.example`, which is master-only), `web/data/`, `bio/models/`, camera frames, screenshots of faces, `node_modules`, `.venv`.

## 5. Engineering rules

- All hard rules in `AGENTS.md` apply. The PR checklist in `docs/security.md` applies to every auth/session/recovery change.
- No new npm dependencies in `web/`. Everything in `docs/architecture.md#stack` is installed. If you are truly blocked, add a `REQUEST` and build around it. (B owns `bio/pyproject.toml`; D owns `phish/package.json`.)
- No DB schema changes. The schema on `main` is the full `docs/data-model.md`. If you need a column, add a `REQUEST` and work around it.
- Use foundation helpers (`docs/foundation.md`): `route()` + `parseJson()` for every handler, `requireSession()` / `requirePageSession()` for auth, `startRegistration/finishRegistration/startAuthentication/finishAuthentication` for every passkey ceremony, `logEvent()` for every auth-relevant action, `ApiError` codes from `docs/api.md`.
- New error codes, event types or env vars: master-only. Use existing ones, or `REQUEST`.
- UI: shadcn components already in `web/src/components/ui/` (Base UI flavour: use the `render` prop, not `asChild`, e.g. `<Button render={<Link href="/x" />}>Go</Button>`). Don't add shadcn components. Every page uses `PageShell` (title + 🔊), big primary buttons (`BIG` class), works at 360 px.
- Tests: Vitest for pure logic, in `*.test.ts` next to the module, and the tested module must not import `db`, `env` or `next/*` (put logic in a pure file, call it from the impure one). No tests for UI.
- Manual testing: run your dev server on YOUR port only (`pnpm dev -p <port>`). Your DB is `web/data/app.db` in your worktree; `pnpm db:reset` whenever you like. Chrome DevTools → WebAuthn tab gives a virtual authenticator for passkey testing. Stop your servers when you finish.

## 6. When unsure

- Don't ask other agents and don't wait for them. Pick the simplest option consistent with `ps.md` and the docs, implement it, and record it as one line under `## Decisions` in your brief (or in your owned doc). Ask the user only if a choice would violate a hard rule or the docs contradict each other in a way that blocks you.
- If a doc you don't own is wrong: don't edit it; add a `DOC` line in your Handoff with the correction.
- If a foundation file you don't own has a bug: don't edit it; work around it in your files if you can, and add a `BUG` line in your Handoff with `file:line`, the symptom and the proposed patch.

## 7. Status and handoff

Your brief has a `## Status` checklist (tick items as you commit them) and a `## Handoff` section. Before you stop, fill Handoff with:

- **Done**: what works, and how to try it (URL on your port, steps).
- **Not done / known issues**.
- **Decisions**: anything not in the docs.
- **REQUEST / BUG / DOC** lines for the master (one per line, `file:line` where relevant).
- **Test evidence**: the commands you ran and their result.

Then commit it as `chore(<agent>): handoff` and tell the user you are done. Done means: every Status item ticked or explained, all gates green, scope check OK, worktree clean (`git status` empty).
