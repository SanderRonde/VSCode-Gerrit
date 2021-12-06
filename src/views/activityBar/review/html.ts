import { Uri, Webview } from 'vscode';

export function getHTML(extensionURI: Uri, webview: Webview): string {
	const localURI = Uri.joinPath(
		extensionURI,
		'src/views/activityBar/review/html/dist/index.js'
	);
	const uri = webview.asWebviewUri(localURI);

	return `<!DOCTYPE HTML>
<html>
	<head>
	<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Review</title>
	</head>
	<body>
		<div id="app"></div>
		<script src="${uri.toString()}"></script>
	</body>
</html>`;
}
