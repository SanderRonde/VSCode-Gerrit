import { TreeItem } from 'vscode';

export interface TreeItemWithChildren extends TreeItemWithoutChildren {
	getChildren(): Promise<TreeViewItem[]>;
}

export interface TreeItemWithoutChildren {
	getItem(): Promise<TreeItem>;
	getChildren?(): Promise<TreeViewItem[]>;
}

export type TreeViewItem = TreeItemWithoutChildren | TreeItemWithChildren;
