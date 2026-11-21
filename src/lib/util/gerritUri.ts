export function toGerritUriPath(filePath: string): string {
	if (!filePath) {
		return '/';
	}
	return filePath.startsWith('/') ? filePath : `/${filePath}`;
}
