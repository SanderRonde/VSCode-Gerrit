import { OVERVIEW_CSS } from './styles';

export interface OverviewComment {
  filePath: string;
  line?: number;
  message: string;
  authorName: string;
  updatedStr: string;
  isDraft: boolean;
  unresolved: boolean;
  codeSnippet?: string;
  patchSet?: number;
}

export interface FileGroup {
  filePath: string;
  comments: OverviewComment[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFileGroup(
  group: FileGroup,
  clickable: boolean = true
): string {
  const commentRows = group.comments.map((c) => {
    const badge = c.isDraft
      ? '<span class="badge draft">Draft</span>'
      : c.unresolved
        ? '<span class="badge unresolved">'
        + 'Unresolved</span>'
        : '';
    const psBadge =
      !clickable && typeof c.patchSet === 'number'
        ? `<span class="badge older-ps">`
        + `PS ${c.patchSet}</span>`
        : '';
    const msgPreview =
      escapeHtml(c.message).substring(0, 300);
    const author = escapeHtml(c.authorName);
    const time = c.updatedStr;
    const snippetHtml = c.codeSnippet
      ? `<pre class="code-snippet">${escapeHtml(c.codeSnippet)
      }</pre>`
      : '';

    const rowClass = clickable
      ? 'comment-row'
      : 'comment-row older-patchset';
    const onclick = clickable
      ? ' onclick="navigate(this)"'
      : '';

    return `
<div class="${rowClass}"
	data-file="${escapeHtml(c.filePath)}"
	data-line="${c.line ?? ''}"
	data-patchset="${c.patchSet ?? ''}"
	${onclick}>
	<div class="comment-header">
		<span class="location">
			Line ${c.line ?? 'file-level'}
		</span>
		${badge}
		${psBadge}
		<span class="meta">
			${author} &middot; ${time}
		</span>
	</div>
	${snippetHtml}
	<div class="comment-body">${msgPreview}</div>
</div>`;
  }).join('');

  const displayPath =
    group.filePath === '/PATCHSET_LEVEL'
      ? 'Patchset Level'
      : group.filePath;

  return `
<div class="file-group">
	<div class="file-header">
		<span class="codicon codicon-file"></span>
		${escapeHtml(displayPath)}
		<span class="count">
			(${group.comments.length})
		</span>
	</div>
	${commentRows}
</div>`;
}

export function buildHTML(
  changeNumber: string,
  draftGroups: FileGroup[],
  unresolvedGroups: FileGroup[],
  olderPatchsetGroups: FileGroup[]
): string {
  const draftCount = draftGroups.reduce(
    (s, g) => s + g.comments.length, 0
  );
  const unresolvedCount = unresolvedGroups.reduce(
    (s, g) => s + g.comments.length, 0
  );
  const olderCount = olderPatchsetGroups.reduce(
    (s, g) => s + g.comments.length, 0
  );

  const olderSection =
    olderPatchsetGroups.length > 0
      ? `
<div class="section older-patchset-section">
	<h2>
		<span class="codicon codicon-history"></span>
		Older Patchset Comments (${olderCount})
	</h2>
	<div class="older-patchset-note">
		These comments are from an older patchset
		and cannot be navigated to.
	</div>
	${olderPatchsetGroups.map(
        (g) => renderFileGroup(g, false)
      ).join('')}
</div>` : '';

  const draftsSection = draftGroups.length > 0
    ? `
<div class="section">
	<h2>
		<span class="codicon codicon-edit"></span>
		Draft Comments (${draftCount})
	</h2>
	${draftGroups.map(
      (g) => renderFileGroup(g)
    ).join('')}
</div>` : '';

  const unresolvedSection =
    unresolvedGroups.length > 0
      ? `
<div class="section">
	<h2>
		<span class="codicon codicon-warning"></span>
		Unresolved Comments (${unresolvedCount})
	</h2>
	${unresolvedGroups.map(
        (g) => renderFileGroup(g)
      ).join('')}
</div>` : '';

  const empty = !draftGroups.length
    && !unresolvedGroups.length
    && !olderPatchsetGroups.length;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport"
	content="width=device-width, initial-scale=1.0">
<style>
${OVERVIEW_CSS}
</style>
</head>
<body>
<h1>Review Comments \u2014 Change ${escapeHtml(changeNumber)
    }</h1>
${empty
      ? '<div class="empty">No draft or '
      + 'unresolved comments found.</div>'
      : olderSection + draftsSection + unresolvedSection
    }
<script>
const vscode = acquireVsCodeApi();
function navigate(el) {
	if (!el) return;
	vscode.postMessage({
		command: 'navigate',
		filePath: el.dataset.file,
		line: el.dataset.line
			? parseInt(el.dataset.line) : undefined,
		patchSet: el.dataset.patchset
			? parseInt(el.dataset.patchset) : undefined
	});
}
</script>
</body>
</html>`;
}
