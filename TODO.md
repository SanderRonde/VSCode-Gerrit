[x] "Backend"
	[x] "gerrit credentials" command
	[x] Implement gerrit API
	[x] Caching?
[ ] Visual
	[ ] Patches pane
		[ ] ... buttons
			[ ] Allow changing view. Options:
				[ ] Dashboard
				[ ] Draft comments
				[ ] Starred changes
				[ ] Open
				[ ] Merged
		[ ] Show patches under headers with following info:
			[ ] #ID
			[ ] Subject
			[ ] Owner
			[ ] V
			[ ] Maybe multiline?
		[ ] Rightclick on patches:
			[ ] Checkout
			[ ] Checkout & stash current
			[ ] Uncheckout & unstash previous
			[ ] Start review
			[ ] Stop review
			[ ] Open on gerrit
			[ ] +2 ?
		[ ] Patch expands to:
			[ ] Description
				[ ] Clicking opens inline gerrit webview
					[ ] Possible future TODO, create custom UI
			[ ] All changed files by path
				[ ] Badges:
					[ ] A (added)
					[ ] M (modified)
					[ ] D (deleted)
					[ ] Double-check standards here
				[ ] Add "mark reviewed" checkmark as button
				[ ] Add comment icon that shows whether you commented
				[ ] RMB:
					[ ] Open unmodified
					[ ] Open modified
					[ ] Open on gerrit
				[ ] What happens when you click:
					[ ] Diff view
						[ ] Highlighting text and pressing "c" creates comment
							[ ] Or right-click "create comment"
						[ ] Add line on the left that allows creating comments
							[ ] If text highlighted when creating commnt, use that text
					[ ] Show comments
						[ ] Default-expand unresolved, collapse resolved
						[ ] Add the magic buttons (done etc)
						[ ] Inline text field etc
							[ ] Cancel, save, resolved
	[ ] Reply pane
		[ ] Contains everything under the "reply" button and some more:
			[ ] Reviewers
			[ ] CC
			[ ] Main textfield
				[ ] Checkbox [resolved]
			[ ] All scores
				[ ] Code-review
				[ ] Others
			[ ] Checkbox [publish X drafts]
			[ ] Attention set modifier
			[ ] if WIP, show "start review"
			[ ] Show cancel (reset) button
		[ ] Shows this data for the currently checked-out patch
			[ ] If clicking "review" instead of "checkout & review" in patches, show it as well. Shows the reviewing patch in the bottom bar. Can click that to stop reviewing (or the patch itself).
				[ ] Also a "stop reviewing X" button below reply button.
	[ ] Add "review" button in source control
		[ ] If first patchset, automatically open reply pane
			 [ ] Allow disabling this in settings
	[x] Add bottom bar showing currently checked-out patch
		[-] Rightclicking:
			[-] Uncheckout
			[-] Uncheckout & unstash previous
			[-] Cancel review (if just reviewing)
