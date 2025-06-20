# Change Log

All notable changes to the "gerrit" extension will be documented in this file.

## 1.2.57

-   Ensure custom arguments to `git-review` are passed to the `git-review` command when multiple changes

## 1.2.56

-   Infer host and remote from git remote when .gitreview file is not available

## 1.2.55

-   Fix issue where the "open on remote" option would not be shown in the notification after pushing a change

## 1.2.54

-   Fix bug where an error message would be shown when submitting multiple changes

## 1.2.53

-   Fix clickable area of buttons in review panel

## 1.2.52

-   Further fix issue where rebasing would fail if the current branch had no upstream

## 1.2.51

-   Account for Gerrit setups where `/config/server/version` is not available without authentication by falling back to an authenticated request.

## 1.2.50

-   Fix issue where rebasing would fail if the current branch had no upstream

## 1.2.49

-   Fix issue where the extension would cause a 404 HTTP request to be sent about once a second while the local change wasn't pushed yet.

## 1.2.48

-   Don't test access to irrelevant URLs when setting up credentials

## 1.2.47

-   Add support for custom arguments to the `git-review` command

## 1.2.46

-   Speed up change panel and expanding of changes in this panel significantly. Also perform less API requests in this panel.

## 1.2.45

-   Store credentials in the keychain instead of the settings

## 1.2.44

-   Fix `gerrit.auth.cookie` setting to work for PUT requests as well

## 1.2.43

-   Improve debugging of credentials setup. Now shows whether connection or authentication failed and shows a cURL command to reproduce the request.

## 1.2.42

-   Add support for the new `resolved` state for VSCode comments

## 1.1.37

-   Checkout using change selector doesn't silently fail

## 1.1.36

-   Use git root as root instead of workspace root
-   Improve picking of gerrit repo when there are multiple projects
-   Fix some issues with comments showing twice

## 1.1.35

-   Filter by current project by default

## 1.1.34

-   Patch checkout now logs when it fails to checkout a patch
-   Fix an issue where "next unresolved comment" would cause an error if there were no comments in the file

## 1.1.33

-   Allow specifying a custom template for the titles of patches in the dashboard

## 1.1.32

-   Fix typo that prevents comment link from working

## 1.1.31

-   Allow changing authenticated URL from `a/`. Useful for the AOSP Gerrit instance.
-   Use more of the last commits to determine whether the current repo is a gerrit repo.

## 1.1.30

-   Improve UI around "git review" command and change selector

## 1.1.29

-   Fix issue where review panel would not load in some cases.

## 1.1.28

-   URI handler is smarter about when to open diff viewer and then to open the file locally.

## 1.1.27

-   Remove `.git` postfix from `.gitreview` project name

## 1.1.26

-   Add `Open on gitiles` gutter action and command palette action

## 1.1.25

-   Fix checkout feature for Gerrit 3.9.1

## 1.2.20

-   Add support for a URI handler (see README)

## 1.2.18

-   Fix patchset selector
-   Fix some buttons in the change overview panel
-   Add an "open online" button to the change overview panel

## 1.2.17

-   Refresh comments when posting/publishing

## 1.2.16

-   Fix multiple git repos sometimes not working (#49)

## 1.2.13

-   Remove use of depracated `assignee` operator
-   Allow posting comments without submitting for review

## 1.2.12

-   Don't post "this change is ready for review" if change did not go from WIP to ready

## 1.2.11

-   Remove deprecated `is:ignored` filter

## 1.2.10

-   Just a version bump

## 1.2.9

-   Don't show version warning when no version can be found

## 1.2.8

-   Make unresolved comments the default

## 1.2.7

-   Add support for multi-git-repo setups

## 1.2.6

-   Show warning if using an older gerrit version

## 1.2.5

-   Now presents choice when submitting multiple commits instead of erroring
-   Shows master/main branch in change selector

## 1.2.4

-   Add option for setting default comment expansion state (`gerrit.expandComments`)

## 1.2.3

-   Change selector also works for only change numbers now

## 1.2.1

-   Fix issues with projects having URI-unsafe glyphs (thanks to [Arno500](https://github.com/Arno500) for [the PR](https://github.com/SanderRonde/VSCode-Gerrit/pull/19))

## 1.2.0

-   Initial release
