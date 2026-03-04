# New Feature Workflow

## Objective

Provide a repeatable, end-to-end SOP for commencing and delivering any new feature — from initial understanding through implementation, validation, and merge into `main`.

## When to Use This Workflow

Whenever the user says they want to implement a new feature, build something new, or asks "where do I start?".

---

## Step 1: Understand the Feature

Before writing a single line of code, make sure you fully understand what is being built.

Ask the user (or infer from context):

1. **What is the feature?** — describe it in one sentence.
2. **Why is it needed?** — what user problem or business goal does it solve?
3. **What does "done" look like?** — define the acceptance criteria or success conditions.
4. **Are there existing files, components, or workflows that touch this area?** — explore `tools/`, `workflows/`, and the app codebase to avoid duplication.
5. **Are there any constraints?** — performance, security, API limits, third-party dependencies.

Summarize your understanding back to the user before proceeding.

---

## Step 2: Follow the GitOps Workflow

Before touching any file, follow `workflows/gitops_workflow.md` from Step 1:

- Confirm whether to create a new feature branch.
- Pull latest `main` and create a scoped branch (e.g. `feature/my-new-feature`).

> Do not skip this step. All work must happen on a dedicated branch.

---

## Step 3: Plan the Implementation

Break the feature into small, logical tasks. Write them out as a checklist before starting:

```
- [ ] Task 1 — e.g. create database schema / API endpoint
- [ ] Task 2 — e.g. build backend logic / service layer
- [ ] Task 3 — e.g. build UI component
- [ ] Task 4 — e.g. wire up frontend to API
- [ ] Task 5 — e.g. write tests
- [ ] Task 6 — e.g. update documentation / workflows
```

Check `tools/` for any existing scripts that can be reused. Only create new tools when nothing already covers the task.

---

## Step 4: Implement Incrementally

Work through your checklist one task at a time:

1. Make the change.
2. Lint / build / test immediately — don't accumulate untested changes.
3. Commit each logical unit of work with a clear message:
   ```
   git commit -m "Add API endpoint for feature X"
   ```
4. If something breaks, fix it before moving to the next task.

Follow the principle: **small commits, fast feedback loops**.

---

## Step 5: Validate the Feature End-to-End

Once all tasks are complete, perform a full end-to-end check:

- Run the full test suite (if one exists).
- Manually exercise the new feature — run the app or relevant CLI and confirm the expected behavior.
- Check for edge cases identified in Step 1.
- Review for security concerns (no hardcoded secrets, no exposed sensitive data, no unvalidated inputs).

Do **not** proceed to Step 6 until validation passes.

---

## Step 6: Update Documentation and Workflows

- Update any relevant `workflows/` files if the feature changes how the system operates.
- Update `README.md` or other docs if the feature adds new commands, endpoints, or configuration.
- If you learned something new during implementation (rate limits, API quirks, better approaches), document it in the relevant workflow now.

---

## Step 7: Complete the GitOps Flow

Return to `workflows/gitops_workflow.md` Step 4 to complete the delivery:

- Stage and commit all remaining changes.
- Push the branch to GitHub.
- Raise a Pull Request with a clear title and description.
- Get the PR approved and merged into `main`.
- Delete the feature branch.

---

## Edge Cases

| Situation | Action |
|---|---|
| Requirements are unclear | Stop and clarify with the user before writing any code |
| Feature touches a third-party API | Check for rate limits, auth requirements, and existing tools before building |
| Feature is too large for one PR | Break it into sub-features, each on its own branch and PR |
| Tests or build fail after implementation | Fix before raising the PR — never merge broken code |
| A better approach is discovered mid-build | Discuss with the user, update the plan, then proceed |

---

## Summary Checklist

- [ ] Understood the feature and confirmed with the user
- [ ] Created a feature branch via `gitops_workflow.md`
- [ ] Wrote an implementation plan as a checklist
- [ ] Implemented each task incrementally with commit-per-unit
- [ ] Validated end-to-end (tests + manual verification)
- [ ] Updated relevant documentation and workflows
- [ ] Completed GitOps flow: commit → push → PR → merge → branch deleted
