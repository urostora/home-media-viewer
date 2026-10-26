# Larger development tasks

Use this workflow for changes with multiple dependent subtasks, substantial investigation, or work likely to span sessions. Small, self-contained edits do not need a saved plan. Read other guides only when relevant to the current subtask.

## 1. Create the execution plan

1. Inspect the relevant code, configuration, tests, and existing worktree changes. Identify the requested outcome, scope, dependencies, and validation needs.
2. Ask the user about anything unclear; do not guess requirements, expected behavior, or acceptance criteria. Record unanswered questions and wait for answers before dependent implementation. Independent investigation may continue.
3. Create `temp/tasks/YYYY-MM-DD-short-description/plan.md` relative to the repository root, using the task's start date and a concise descriptive slug. Reuse that directory when resuming; avoid overwriting another task's records.
4. Save a detailed, ordered plan before implementing. Include the objective, scope, clarified decisions, open questions, and smaller subtasks with stable IDs. Each subtask must have a short title, description, current status (`to do`, `in progress`, or `done`), dependencies where relevant, and observable success criteria where meaningful. If criteria do not apply, explain briefly.
5. Include validation and cleanup in the plan. Plan checks proportionate to the change, using the testing and Docker guides. A saved plan does not require a separate approval step unless the user requests one or an applicable rule requires approval.

Use this structure, repeating the subtask block as needed:

```md
# Task: <short title>

- Objective: <requested outcome>
- Scope: <included work and boundaries>
- Decisions: <clarified requirements>
- Open questions: <unanswered questions, or none>
- Updated: <date/time>

## T1: <short title>

- Status: to do
- Description: <concrete work>
- Dependencies: <subtask IDs, or none>
- Success criteria: <observable conditions, or not applicable with reason>
- Validation/results: <checks and outcomes; fill in during execution>
- Blocker/next action: <when relevant>
```

## 2. Execute and maintain progress

1. Work through the plan in dependency order. Mark the current subtask `in progress` before starting and keep statuses and the update time current.
2. Implement the subtask and run its relevant checks. Mark it `done` only when its description is fulfilled and all applicable success criteria are met. Record validation evidence and results in the plan before cleanup.
3. If a check fails or cannot run, record the failure or blocker and next action; keep the subtask unfinished if its criteria remain unverified. Do not silently weaken criteria to mark work done.
4. When new findings change scope, dependencies, or sequencing, revise the plan before continuing. Ask the user when a requirement or intended outcome is unclear.
5. After each subtask, update the plan and retain only useful information for remaining work in `cache.md`. Clean up disposable subtask resources according to repository rules.

## 3. Keep a concise continuation cache

Create `cache.md` in the same task directory when there is useful information to retain. Before an interruption or handoff, ensure it exists and records the next concrete action.

Keep only information that helps following subtasks avoid repeated discovery: relevant file paths, confirmed findings, user decisions, command prerequisites, resource ownership, unresolved blockers, and validation results worth reusing. Link to the plan for status rather than maintaining a second status list. Distinguish confirmed facts from unresolved questions; remove obsolete information.

Do not copy entire files, raw logs, or conversation history. Never store credentials, tokens, personal media, or resolved secret environment values. Record safe resource identifiers and configuration paths when needed for continuation or cleanup.

## 4. Resume interrupted work

Read the existing `plan.md` and `cache.md`, then inspect the current worktree and relevant runtime resources. Verify that recorded findings still apply. An `in progress` subtask is unfinished; inspect its partial changes and resume from the recorded next action. Reuse valid completed work and validation, repeating checks only when changes or uncertainty justify it. If several task directories could match, ask which one to resume.

## 5. Complete the task

Confirm that all subtasks and overall requirements are satisfied, record final validation, and remove remaining disposable resources. Preserve `plan.md` and `cache.md` as intentional task records, even though they live under `temp/`; do not force-add ignored task records to Git unless requested. Trim the cache to useful final findings and note that no work remains. Report the outcome, changed files, validation, and any unresolved limitations to the user.
