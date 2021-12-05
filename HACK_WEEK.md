# Hackweek stuff

(will probably purge this from git afterwards but don't put anything too sensitive here)

-   [ ] Potential starting points:
    -   [ ] Reply pane
        -   [ ] Can we do reply pane with VSCode or do we need a webview? - [ ] If webview, do we need a design?
    -   [ ] Checkout flow
        -   [ ] "Checkout this patch"
    -   [ ] Create-patch flow
        -   [ ] Adding a button to source control pane that says "submit for review"?
            -   [ ] What should it do... Take you to the reply pane? to the website? Do nothing? Configurable?
    -   [ ] Review mode
        -   [ ] Do we want this?
        -   [ ] How do we show to the user that it's active (and make it easily cancelable)
        -   [ ] Show comments inline in editor (in edit-mode, not read-only)
            -   [ ] Challenge: how do we make sure comments stick to the original code when lines are inserted/removed/changed
    -   [ ] Investigate instant startup (no more `onStartupFinished`)
    -   [ ] Investigate quick-checkout. Essentially stash current & checkout. Then when exiting quick-checkout, go back to old branch & unstash.
    -   [ ] Investigate "notify when passes checks". Can we do hooks?
    -   [ ] In-editor webview of a change. Stripped-down, prettier :)
    -   [ ] Check out performance, memory leaks, optimize API requests? Especially interesting when we change the extension to start on-editor-boot (instead of on-loading-done)
