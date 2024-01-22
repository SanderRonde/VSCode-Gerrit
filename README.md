# VSCode Gerrit

Extension for integrating the [gerrit code review tool](https://www.gerritcodereview.com/) into VSCode. Allows viewing of Gerrit changes, the file changes they contain and their diffs, as well as commenting on these changes. Also enables you to create and submit new changes, as well as of course ammending existing ones.

## Setup

To set up the extension, there's a few settings you need to configure. To get these values, go to your gerrit user settings (click on the little cogwheel) and scroll down to "HTTP Credentials". Then you need to choose between either entering your HTTP username and password or using cookie-based authentication.

-   `gerrit.auth.username` - This is your username on gerrit. You can find this next to the `Username` field under "HTTP Credentials".
-   `gerrit.auth.password` - This is your HTTP password. You can generate one by clicking "Generate new password" and copying it.
-   `gerrit.auth.cookie` - This is your authentication cookie. You can find it by opening gerrit, opening the developer tools, going to the "Application" tab and expanding the "Cookies" section. Then copy the value of the `GerritAccount` cookie.
-   `gerrit.auth.url` - This is automatically inferred from your `.gitreview` file (if you have one). If you don't have one or it doesn't work, set this URL to the HTTP URL of your gerrit instance. This will be the URL your visit in the browser.

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

### Stream events

While the changes and data in the UI refresh frequently, changes are not instant. You are able to instantly have any changes reflected in the UI as they occur by using the stream-events feature. This makes use of a Gerrit feature that allows you to listen for Gerrit events by using SSH. To enable this, enable the `gerrit.streamEvents` setting. Note that you need to either be a member of the Administrators group or you need to have been given the `Stream Events` permission.
