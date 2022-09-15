# VSCode Gerrit

Extension for integrating the [gerrit code review tool](https://www.gerritcodereview.com/) into VSCode. Allows viewing of Gerrit changes, the file changes they contain and their diffs, as well as commenting on these changes. Also enables you to create and submit new changes, as well as of course ammending existing ones.

## Setup

To set up the extension, there's a few settings you need to configure. To get these values, go to your gerrit user settings (click on the little cogwheel) and scroll down to "HTTP Credentials". Then you need to configure the following settings in VSCode:

-   `gerrit.auth.username` - This is your username on gerrit. You can find this next to the `Username` field under "HTTP Credentials".
-   `gerrit.auth.password` - This is your HTTP password. You can generate one by clicking "Generate new password" and copying it.
-   `gerrit.auth.url` - This is automatically inferred from your `.gitreview` file (if you have one). If you don't have one or it doesn't work, set this URL to the HTTP URL of your gerrit instance. This will be the URL your visit in the browser.

Additionally the extension requires the python package [git-review](https://pypi.org/project/git-review/) to be installed.