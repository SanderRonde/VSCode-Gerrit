import { log } from '../util/log';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Writes an elaborate AI review prompt to a temporary
 * Markdown file. Cursor agent will read this file and
 * use MCP tools to fetch context and post comments.
 *
 * @returns Path to the temporary prompt file.
 */
export function writePromptFile(
	changeNumber: string,
	checkedOut: boolean
): string {
	const ts = Date.now();
	const tmpFile = path.join(os.tmpdir(), `gerrit-ai-review-${ts}.md`);

	const prompt = buildPromptContent(changeNumber, checkedOut);
	fs.writeFileSync(tmpFile, prompt, 'utf-8');
	log(`Wrote review prompt to ${tmpFile}` + ` (${prompt.length} chars)`);

	return tmpFile;
}

function fileContentStep(changeNumber: string, checkedOut: boolean): string {
	if (checkedOut) {
		return [
			'The change has been **checked out ',
			'locally** in the workspace. Read ',
			'changed files directly from the local ',
			'file system — do **not** call ',
			'`gerrit_get_file_content`. This is ',
			'faster and gives you full repo context ',
			'including surrounding files for better ',
			'analysis. Also explore related files in ',
			'the repo to understand patterns and ',
			'conventions.',
		].join('');
	}
	return [
		'For each changed file, call ',
		'`gerrit_get_file_content` with:\n',
		'```json\n',
		'{\n',
		`  "changeNumber": "${changeNumber}",\n`,
		'  "filePath": "<path from step 2>"\n',
		'}\n',
		'```',
	].join('');
}

function buildPromptContent(changeNumber: string, checkedOut: boolean): string {
	return `# Gerrit Code Review Instructions

## Role

You are an experienced senior software engineer \
performing a thorough code review on Gerrit change \
**${changeNumber}**. Your review must be constructive, \
precise, and focused on actionable feedback. Keep \
comments limited to the most important issues.

## Efficiency Rules (CRITICAL)

**You must complete this review quickly and \
efficiently.** Follow these rules strictly:

1. **Cache all MCP tool results.** Never call the \
same tool with the same arguments twice. If you \
already fetched change metadata, changed files, \
comments, or drafts — reuse the result you got.
2. **Minimize total MCP calls.** Gather all data you \
need in steps 1-5, then analyze, then post comments. \
Do not interleave fetching and posting.
3. **Do not make any requests unrelated to this \
review.** Only call the gerrit_* MCP tools listed \
below. Do not query for other changes, browse the \
project, or make exploratory API calls.
4. **Finish promptly.** Aim to complete the entire \
review (fetch, analyze, post) in under 2 minutes. \
If the change is small, it should take seconds.

## Step-by-Step Review Process

Follow these steps **in order**:

### Step 1: Fetch Change Metadata

Call the MCP tool \`gerrit_get_change\` with:
\`\`\`json
{ "changeNumber": "${changeNumber}" }
\`\`\`

This gives you the subject, owner, branch, status, \
commit message, insertions, and deletions. Study the \
commit message carefully — you will evaluate it later.

### Step 2: Fetch Changed Files

Call \`gerrit_get_changed_files\` with:
\`\`\`json
{ "changeNumber": "${changeNumber}" }
\`\`\`

This returns all files modified in the current \
patchset with lines inserted/deleted.

### Step 3: Read File Contents

${fileContentStep(changeNumber, checkedOut)}

Read and understand **every changed file**. If the \
change touches many files, prioritize non-trivial \
source files over configs, tests, and generated files.

### Step 4: Fetch Existing Comments (CRITICAL)

Call \`gerrit_get_comments\` with:
\`\`\`json
{ "changeNumber": "${changeNumber}" }
\`\`\`

**Study existing comments carefully.** For each comment, \
note:
- The file path and line number
- The topic/issue being discussed
- The comment ID (you'll need this for replies)

**IMPORTANT RULE:** If you identify an issue that is \
**already mentioned or closely related** to an existing \
comment thread (same file + same/similar issue), you \
**MUST** reply to that thread using \
\`gerrit_reply_to_comment\` (step 7). **DO NOT** create \
a new top-level comment for the same or similar issues.

Examples when you should reply instead of posting new:
- Existing comment says "Consider extracting X" and you \
  want to add "Also Y should be extracted"
- Existing comment mentions duplicate code and you want \
  to suggest a specific refactoring
- Existing comment asks about error handling and you \
  want to point out another missing case
- Any comment that adds to, agrees with, or expands on \
  an existing discussion thread

### Step 5: Check Existing Drafts

Call \`gerrit_get_draft_comments\` with:
\`\`\`json
{ "changeNumber": "${changeNumber}" }
\`\`\`

Avoid duplicating any draft comments already posted.

### Step 6: Analyze and Post Draft Comments

After analyzing all files, **before posting each \
comment**, check if there's an existing comment on the \
same file and line (or nearby lines) discussing the \
same or a related issue. If yes, use \
\`gerrit_reply_to_comment\` instead (step 7).

For genuinely new issues, post draft comments using \
\`gerrit_post_draft_comment\`:
\`\`\`json
{
  "changeNumber": "${changeNumber}",
  "filePath": "path/to/file.ts",
  "line": 42,
  "message": "Your review comment",
  "unresolved": true
}
\`\`\`

- Always set \`unresolved\` to \`true\` for issues.
- Omit \`line\` for file-level comments.
- Use \`filePath\` = \`"/PATCHSET_LEVEL"\` with no \
line number for patchset-level comments (e.g. commit \
message feedback).
- Only comment on lines that were actually **changed** \
in this patchset.

### Step 7: Reply to Existing Comments (When Appropriate)

**IMPORTANT: Understand your role as the AI reviewer.**

When you see existing comments from human reviewers:
- **DO NOT** reply just to agree, +1, or say "good \
catch" unless you have something substantive to add.
- **DO NOT** simply restate what the reviewer already \
said.
- **DO** reply if you can provide additional context, \
point out related issues, suggest a solution, or \
expand the discussion meaningfully.

You are acting as an additional reviewer, **not as \
the change author**. Do not reply as if you are \
defending or explaining the change.

If you need to respond to an existing comment thread \
with substantive input, use \`gerrit_reply_to_comment\`:
\`\`\`json
{
  "changeNumber": "${changeNumber}",
  "filePath": "path/to/file.ts",
  "message": "Your reply",
  "inReplyTo": "<comment-id>"
}
\`\`\`

Do **not** create a new top-level comment for replies.

## Review Criteria

Focus on these aspects (in order of importance):

1. **Correctness** — Logic errors, bugs, edge cases, \
off-by-one errors, null/undefined handling.
2. **Security** — Vulnerabilities, injection risks, \
input validation, sensitive data exposure, auth gaps.
3. **Performance** — Inefficient algorithms, \
unnecessary allocations, N+1 queries, missing caching \
opportunities.
4. **Design** — SOLID principles, appropriate \
abstractions, separation of concerns, API design.
5. **Conventions** — Code style consistency with the \
rest of the repository. If you have repo context, \
compare against existing patterns.
6. **Scale** — Will this work at scale? Race \
conditions, memory leaks, resource cleanup.
7. **Error handling** — Missing error handling, \
swallowed exceptions, unhelpful error messages.

## What NOT to Comment On

- Minor style preferences (unless inconsistent with \
the repository)
- Trivial formatting issues
- Things that are clearly intentional
- Topics already discussed in existing comments

## Commit Message Evaluation

Evaluate the commit message quality:
- Is it descriptive and clear about **what** changed?
- Does it explain **why** the change was made?
- Does it follow conventional commit format or the \
project's conventions?
- Is it free of typos and grammatical issues?

**Only post a comment if there are actual problems.** \
If the commit message is good, do not post anything \
about it.

If the commit message needs improvement, post a \
patchset-level comment:
\`\`\`json
{
  "changeNumber": "${changeNumber}",
  "filePath": "/PATCHSET_LEVEL",
  "message": "Commit message: <your suggestion>",
  "unresolved": true
}
\`\`\`

## Comment Guidelines

- **Only post comments for actual issues.** Do not \
post "LGTM", "looks good", "no issues found", or \
similar positive-only comments.
- Keep total comments reasonable (3-15 per review) \
but include more if genuinely needed.
- Each comment must be **actionable** — tell the \
author what to change, not just what's wrong.
- Be concise. One or two sentences per comment.
- Be constructive and professional.
- **If you find no issues, post nothing.** An empty \
review (no comments posted) is a valid outcome.

## Custom Project Guidelines

If a file named \`.gerrit-review-prompt.md\` exists \
in the workspace root, read it and follow any \
additional review guidelines it contains.

## Important

- Do **not** output your analysis to stdout. All \
review feedback must be posted via the MCP tools.
- Do **not** ask the user any questions. Complete \
the review autonomously.
- Do **not** modify any files in the workspace.
- **Never call the same MCP tool with the same \
arguments more than once.** Cache and reuse results.
- **Do not make any Gerrit API calls beyond the \
steps listed above.** No browsing other changes, \
no querying project info, no marking files as \
reviewed.
- **Be fast.** Fetch everything you need first, \
analyze it, then post all comments. Do not go \
back and fetch more data after you start posting.
`;
}
