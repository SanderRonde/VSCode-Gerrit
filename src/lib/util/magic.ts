/**
 * Magic strings that are used in the package.json and as raw strings in
 * the code. We put them here to provide **some** form of documentation.
 */

// Info about comments thread resolved status
export const LAST_COMMENT_WAS_DRAFT = 'yesLastCommentDraft';
export const COMMENT_THREAD_IS_RESOLVED = 'yesResolved';
export const COMMENT_THREAD_IS_NOT_RESOLVED = 'noResolved';

// Info about threads on quick actions (resolve, ack)
export const COMMENT_QUICK_ACTIONS_POSSIBLE = 'quickActionable';
export const COMMENT_IS_EDITABLE = 'editable';
export const COMMENT_IS_DELETABLE = 'deletable';

// Contexts that signify the type of a file tree item
export const TREE_ITEM_TYPE_FILE = 'filechange';
export const TREE_ITEM_TYPE_CHANGE = 'gerritchange';

// Contexts that signify status of tree items
export const TREE_ITEM_CHANGE_CUSTOM_PATCHSET_SELECTION = 'customPatchset';
export const TREE_ITEM_WAS_MODIFIED = 'modified';
export const TREE_ITEM_IS_CURRENT = 'yesCurrent';
export const TREE_ITEM_IS_NOT_CURRENT = 'noCurrent';

// Contexts that signify status of in-editor file (and live in URI)
export const OPEN_FILE_HAS_UNRESOLVED_COMMENTS = 'hasUnresolved';
export const OPEN_FILE_IS_PATCHSET_LEVEL_FILE = 'patchsetLevel';
export const OPEN_FILE_IS_CHANGE_DIFF = 'gerritDiff';
