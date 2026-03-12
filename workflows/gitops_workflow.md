# GitOps Workflow

## Objective

Ensure every coding task follows a safe, traceable GitOps process: confirm branch intent, create a scoped feature branch, do the work, then raise and merge a PR back into `main`.

## When to Use This Workflow

**Always** — before making any file edits or code changes.

---

## Step 1: Confirm Branch Creation

Before touching any file, ask the user:

> "Should I create a new feature branch off `main` for this task? (yes / no)"

- If **yes** → proceed to Step 2.
- If **no** → confirm which existing branch to work on, then skip to Step 3.

---

## Step 2: Pull Latest `main` and Create a Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b <feature-branch-name>
```

**Branch naming convention:** use a short, kebab-case name that describes the task.

Examples:

- `feature/add-user-auth`
- `fix/login-redirect-bug`
- `chore/update-dependencies`
- `docs/update-readme`

Push the new branch to GitHub immediately so it is tracked remotely:

```bash
git push -u origin <feature-branch-name>
```

---

## Step 3: Do the Work

- Make all required file changes on the feature branch.
- Validate the changes (lint, build, test as appropriate).
- Confirm with the user that everything is working before proceeding.

---

## Step 4: GitOps Flow — Commit, Push, PR, Merge

Once all changes are confirmed working, follow these steps in order:

### 4a. Stage and commit all changes

```bash
git add .
git commit -m "<sensible commit message describing what changed and why>"
```

Commit message guidelines:

- Use imperative mood: "Add user auth", not "Added user auth"
- Keep the subject line under 72 characters
- Reference the task or issue number if applicable (e.g. `Fix login redirect (#42)`)

### 4b. Push the branch to GitHub

```bash
git push origin <feature-branch-name>
```

### 4c. Raise a Pull Request

Create a PR from `<feature-branch-name>` → `main` with:

- A clear **title** that summarizes the change
- A **description** that explains what was changed and why
- Link any related issues

### 4d. Approve and merge the PR

- Request a review (or self-approve if authorized).
- Once approved, merge the PR into `main` via the GitHub UI or CLI.
- Delete the feature branch after a successful merge.

### 4e. Deploy to Production (if backend changes are included)

After merging, deploy to the production server:

```bash
# On the server (SSH or cPanel terminal):
cd /home/tradecom/cartaraiq_api
git pull origin main

# ALWAYS run migrations after any backend deploy — missing this causes 500s on every request
python3 -m backend.migrate

# Restart Passenger to pick up code changes
touch tmp/restart.txt
```

> ⚠️ **Never skip the migration step.** Any PR that adds a model column, new table, or index must be migrated on production immediately after deploy.

---

## Edge Cases

| Situation                         | Action                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| User says "no" to new branch      | Confirm the target branch, then proceed from Step 3                           |
| Merge conflict detected           | Stop, notify the user, and ask them to resolve the conflict before continuing |
| Tests / build fails after changes | Do not proceed to Step 4; fix the issue first and re-validate                 |
| PR is rejected during review      | Address the review comments, push updated commits, then request re-review     |

---

## Summary Checklist

- [ ] Confirmed whether to create a new branch
- [ ] Pulled latest `main` and created feature branch (if applicable)
- [ ] Made all required changes
- [ ] Validated changes (lint / build / tests pass)
- [ ] Confirmed with user that everything works
- [ ] Staged and committed with a sensible message
- [ ] Pushed branch to GitHub
- [ ] Raised a PR with a clear title and description
- [ ] PR approved and merged into `main`
- [ ] Feature branch deleted
- [ ] Production: `git pull`, `python3 -m backend.migrate`, `touch tmp/restart.txt`
