# Change Log

All notable changes to the "gerrit" extension will be documented in this file.

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
