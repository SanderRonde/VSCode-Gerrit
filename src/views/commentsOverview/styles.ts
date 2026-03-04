export const OVERVIEW_CSS = `
body {
	font-family: var(--vscode-font-family);
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
	padding: 16px;
	margin: 0;
}
h1 {
	font-size: 16px;
	font-weight: 600;
	margin: 0 0 16px 0;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--vscode-panel-border);
}
h2 {
	font-size: 13px;
	font-weight: 600;
	margin: 16px 0 8px 0;
	display: flex;
	align-items: center;
	gap: 6px;
}
.section {
	margin-bottom: 24px;
}
.file-group {
	margin-bottom: 12px;
	border: 1px solid var(--vscode-panel-border);
	border-radius: 4px;
	overflow: hidden;
}
.file-header {
	background: var(--vscode-sideBar-background);
	padding: 6px 10px;
	font-size: 12px;
	font-weight: 600;
	display: flex;
	align-items: center;
	gap: 6px;
}
.file-header .count {
	opacity: 0.7;
	font-weight: 400;
}
.comment-row {
	padding: 8px 12px;
	cursor: pointer;
	border-top: 1px solid var(--vscode-panel-border);
}
.comment-row:hover {
	background: var(--vscode-list-hoverBackground);
}
.comment-header {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 4px;
	font-size: 11px;
}
.location {
	font-weight: 600;
	color: var(--vscode-textLink-foreground);
}
.meta {
	opacity: 0.6;
	margin-left: auto;
}
.badge {
	font-size: 10px;
	padding: 1px 6px;
	border-radius: 3px;
	font-weight: 600;
}
.badge.draft {
	background: var(--vscode-editorInfo-foreground);
	color: var(--vscode-editor-background);
}
.badge.unresolved {
	background: var(--vscode-editorWarning-foreground);
	color: var(--vscode-editor-background);
}
.code-snippet {
	font-family: var(--vscode-editor-font-family, monospace);
	font-size: 11px;
	line-height: 1.4;
	background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.1));
	border-radius: 3px;
	padding: 4px 8px;
	margin: 4px 0;
	overflow-x: auto;
	white-space: pre;
}
.comment-body {
	font-size: 12px;
	line-height: 1.5;
	white-space: pre-wrap;
	word-break: break-word;
	opacity: 0.9;
}
.empty {
	text-align: center;
	padding: 40px;
	opacity: 0.6;
}
.comment-row.older-patchset {
	cursor: default;
	opacity: 0.6;
}
.comment-row.older-patchset:hover {
	background: inherit;
}
.badge.older-ps {
	background: var(--vscode-descriptionForeground);
	color: var(--vscode-editor-background);
}
.older-patchset-note {
	font-size: 11px;
	opacity: 0.7;
	padding: 4px 10px 8px;
	font-style: italic;
}
.older-patchset-section {
	border-left: 3px solid var(--vscode-editorWarning-foreground);
	padding-left: 8px;
}`;
