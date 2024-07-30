# VSCode Gerrit

Extension for integrating the [gerrit code review tool](https://www.gerritcodereview.com/) into VSCode. Allows viewing of Gerrit changes, the file changes they contain and their diffs, as well as commenting on these changes. Also enables you to create and submit new changes, as well as of course ammending existing ones.

![VSCode Installs](https://img.shields.io/vscode-marketplace/i/sanderronde.vscode--gerrit.svg?label=VSCode%20Marketplace%20Installs)

## Setup

To set up the extension, there's a few settings you need to configure. The easiest way to do this is to run the `Enter credentials` command, which will walk you through everything.

-   `gerrit.remotes` - An object mapping every gerrit root you have to the following fields:
    -   `username` - This is your username on gerrit. You can find this next to the `Username` field under "HTTP Credentials".
    -   `password` - This is your HTTP password. You can generate one by clicking "Generate new password" and copying it.
    -   `cookie` - This is your authentication cookie. You can find it by opening gerrit, opening the developer tools, going to the "Application" tab and expanding the "Cookies" section. Then copy the value of the `GerritAccount` cookie.
    -   `url` - This is automatically inferred from your `.gitreview` file (if you have one). If you don't have one or it doesn't work, set this URL to the HTTP URL of your gerrit instance. This will be the URL your visit in the browser.

Additionally the extension requires the python package [git-review](https://pypi.org/project/git-review/) to be installed.

## Features

### Changes panel

The changes panel (the top panel when you expand the Gerrit sidebar item) contains a list of changes that is essentially equal to your Gerrit dashboard. This list is auto-updated periodically but can also be refreshed manually. You can either check out the changes, do a [quick checkout](#Quick-checkout), or expand it to see the individual files that changed.

Just like on Gerrit, you can tune the changes that are shown in this list by clicking the cogwheel icon (configure filters) and the menu icon (select active view).

Additionally, there is a search feature that allows you to search for any change you want. It features autocompletion for all filters that Gerrit supports and their values.

### Comments

Once a patch is checked out, you are able to place and respond to comments in the changed files. You can do this by clicking the plus icon in the gutter to the left of the editor. Just like on Gerrit you can create both resolved and unresolved comments.

### Review panel

The review panel allows you to post your draft comments and to reply or vote on changes. It always applies to the currently checked-out change and will list the change ID of that patch.

### Quick checkout

Quick checkout allows you to quickly check out a patch while you're working on something. It is essentially equal to `git stash && git review -d changeId`. It then adds a quick-checkout entry both in the Gerrit panel and in the statusbar. Clicking this entry checks out the original branch you were on before doing a quick-checkout and re-applies the stash you created. This allows you to quickly check out a change for review without losing your work.

### Change selector

The change selector can be found in the statusbar. It will at all times list the currently checked out change. Clicking it opens up a picker that shows you your most relevant changes (and the `master` branch). Picking a change checks it out for you. This picker can also be bound to a keyboard shortcut using the `gerrit.openChangeSelector` keybinding.

### Push for review

The Gerrit extension also adds a "Push for review" button in your git panel. It's the vertical line with a circle in the middle. When you click it, the extension will run `git review` for you. If all goes well it then allows you to open the link online, among some other actions.

### Open on [gitiles](https://gerrit.googlesource.com/gitiles/)

Adds a `Open on gitiles` gutter action, as well as ones from the command palette. These allow you to open links to the file you're currently viewing on gitiles, allowing you to share your code with others, even if it's not yet merged.

### URI handler

This extension registers a URI handler for `vscode://sanderronde.vscode-gerrit` URIs. These allow you to open files and changes in your editor. You can either check out the changes or simply preview them. An example use case for this is sending a "view in your editor" link to your coworker so they can inspect your changes in their editor instead of in the web view.

The following (all optional) fields are supported:

-   `change` - The relevant change. If not supplied, defaults to the currently checked out change. Can be either the change ID or patchset number.
-   `patchSet` - The relevant patch set. If not supplied, defaults to the latest patch set. Must be a number.
-   `checkout` - If provided, the change will be checked out. If not, the change will be previewed.
-   `file` - The file to open.
-   `line` - The line to scroll to.

Some examples:

-   `vscode://sanderronde.vscode-gerrit?change=12345&checkout` - Checks out a change
-   `vscode://sanderronde.vscode-gerrit?change=12345&file=index.ts&line=10` - Previews a file in a change without checking it out
-   `vscode://sanderronde.vscode-gerrit?change=12345&checkout&patchset=2` - Checks out an old patchset of a change

### Stream events

While the changes and data in the UI refresh frequently, changes are not instant. You are able to instantly have any changes reflected in the UI as they occur by using the stream-events feature. This makes use of a Gerrit feature that allows you to listen for Gerrit events by using SSH. To enable this, enable the `gerrit.streamEvents` setting. Note that you need to either be a member of the Administrators group or you need to have been given the `Stream Events` permission.
