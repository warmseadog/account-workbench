# Account Workbench Runtime Resources

This folder is copied into packaged desktop builds.

## Chrome extensions

Put unpacked Chrome extensions under:

```text
resources/chrome-extensions/<extension-name-or-id>/manifest.json
```

or, for Chrome-exported versioned folders:

```text
resources/chrome-extensions/<extension-id>/<version>/manifest.json
```

The app automatically adds discovered extension directories to Chrome with `--load-extension` when it opens account profiles.

## Profile template

Put an optional prepared Chrome profile template under:

```text
resources/profile-template/user-data/
```

On first run, the app seeds the user's local template folder from this bundled template, then uses it when creating account profiles.
