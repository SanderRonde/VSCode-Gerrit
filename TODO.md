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
		[ ] Search bar at the top
		[x] Show patches under headers with following info:
			[x] #ID
			[x] Subject
			[x] Owner
			[-] V (not possible)
			[x] Maybe multiline?
		[ ] Rightclick on patches:
			[ ] Checkout
				[ ] Offer to stash and unstash
			[ ] Checkout & Review
			[ ] Toggle review mode
			[ ] Open on gerrit
			[ ] Notify when verified by administrator?
		[ ] Add "refresh" button
			[ ] Periodically refresh
		[ ] Add "fetch more" button
		[x] Patch expands to:
			[x] Description
				[-] Clicking opens inline gerrit webview // Not possible because Gerrit doesn't allow iframes or unauthorized fetching of the HTML. (would also be hard with cookies etc).
					[ ] Possible future TODO, create custom UI
			[x] Do something with comments that aren't inside of a file
			[x] All changed files by path
				[x] Badges:
					[x] A (added)
					[x] M (modified)
					[x] D (deleted)
					[x] Double-check standards here
				[x] Add comment icon that shows whether you (or someone else) commented
				[x] RMB:
					[x] Open unmodified
					[x] Open modified
					[x] Open on gerrit
					[-] Mark reviewed
				[x] What happens when you click:
					[x] Diff view
						[-] Highlighting text and pressing "c" creates comment (not possible in VSCode)
							[-] Or right-click "create comment" (same as above)
						[x] Add line on the left that allows creating comments
							[x] If text highlighted when creating commnt, use that text
					[x] Show comments
						[x] Default-expand unresolved, collapse resolved
						[x] Add the magic buttons (done etc)
						[x] Inline text field etc
							[x] Cancel, save, resolved
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
