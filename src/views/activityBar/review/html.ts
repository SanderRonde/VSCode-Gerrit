import { Uri, Webview } from 'vscode';

export function getHTML(extensionURI: Uri, webview: Webview): string {
	const jsURI = webview.asWebviewUri(
		Uri.joinPath(extensionURI, 'out/review/index.js')
	);

	const codiconsURI = webview.asWebviewUri(
		Uri.joinPath(extensionURI, 'out/review/codicon.css')
	);

	const cssURI = webview.asWebviewUri(
		Uri.joinPath(extensionURI, 'out/review/index.css')
	);

	return `<!DOCTYPE HTML>
<html>
	<head>
	<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Review</title>
		<link href="${codiconsURI.toString()}" rel="stylesheet" />
		<link href="${cssURI.toString()}" rel="stylesheet" />
	</head>
	<body>
		<div id="app"></div>
		<script src="${jsURI.toString()}"></script>
	</body>
</html>`;
}
