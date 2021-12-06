import { TreeItem } from 'vscode';

export interface TreeItemWithChildren extends TreeItemWithoutChildren {
	getChildren(): Promise<TreeViewItem[]> | TreeViewItem[];
}

export interface TreeItemWithoutChildren {
	getItem(): Promise<TreeItem> | TreeItem;
	getChildren?(): Promise<TreeViewItem[]> | TreeViewItem[];
}

export type TreeViewItem = TreeItemWithoutChildren | TreeItemWithChildren;
