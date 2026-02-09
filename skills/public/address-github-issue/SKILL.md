---
name: address-github-issue
description: Triage and address GitHub issues for this repository using the bundled github-issues CLI. Use when asked to read, discuss, respond to, or resolve repo issues; implement code changes from issues; request missing context; or post issue comments and closures.
---

# Address GitHub Issue

Use `skills/public/address-github-issue/scripts/github-issues.mjs` through `npm run issues -- ...` for all GitHub issue reads and writes.

## Setup

1. Ensure `.env` contains `GITHUB_API_KEY=<token>` and `GITHUB_REPOSITORY=<owner/repo>`.
2. Start with `npm run issues -- worklist` or `npm run issues -- read -n <issue-number> --comments`.
3. Add `--json` when machine-readable output is useful.

## Core Flow

1. Read issue details and comments.
2. Classify the issue as code change request, brainstorm/open discussion, or irrelevant to this codebase.
3. Apply the matching workflow below.
4. For actionable code-change issues, create a new branch, implement changes, commit, and push so the diff is on GitHub.
5. Post a concise issue response with `npm run issues -- comment -n <issue-number> -b "<message>"`; for code changes, include what was done and the commit ID.
6. Close when fully resolved with `npm run issues -- close -n <issue-number> -b "<resolution note>"`.
7. In one skill-call session, address only one issue end-to-end.
8. After finishing that issue, ask the user whether to address another issue.

## Workflow: Code Change Request

1. Review the codebase before deciding (search relevant files and existing patterns).
2. Determine whether details are sufficient; for new-page requests, prefer issues that include markdown page content. If content is missing but a reasonable page can be created from existing site patterns, proceed and state assumptions. Otherwise ask focused follow-up questions instead of guessing.
3. Once details are sufficient, create a new branch for the issue (for example `issue-<number>-<short-topic>`).
4. Implement and validate the code changes on that branch.
5. Commit with a clear message and push the branch to GitHub so the diff is available remotely.
6. Reply on the issue with a concise summary of what was implemented and include the commit ID.
7. Keep response concise and explicit with current status, what changed or why blocked, and exact follow-up questions when needed.

Follow-up question style:

1. Ask only what is required to unblock.
2. Use short numbered questions.
3. Keep questions concrete (path, content source, navigation placement, acceptance criteria).

## Workflow: Brainstorm or Open Discussion

1. Respond positively and open-mindedly.
2. Be curious and sympathetic.
3. Ground suggestions in this codebase when relevant.
4. Keep the response concise and clear on key points.

## Workflow: Irrelevant Issue

1. Reply with a short haiku in a randomly chosen language.
2. Stay polite and non-rude.
3. Keep it brief (3 lines).

## CLI Reference

- List issues: `npm run issues -- read -s open -l 20`
- Read one issue: `npm run issues -- read -n <issue-number>`
- Read issue + comments: `npm run issues -- read -n <issue-number> --comments`
- Add comment: `npm run issues -- comment -n <issue-number> -b "<text>"`
- Close issue: `npm run issues -- close -n <issue-number> -b "<resolution note>"`
- Build work queue: `npm run issues -- worklist`
