# Slate Viewer 0.47.0: space pages from the edition

Prepared 2026-11-20 by Claude (thread "Build the Enterprise plan"), released
with Company 0.96.62 and Core 0.100.0. Tier: Core (a small generic hook in the
public Viewer); the page that uses it, the Access page of an organisation's
space, is Company code, Enterprise only.

1. `src/lib/editionTypes.ts`: `SpacePageAddition` (`id`, `label`,
   `component`, `visible(account, space)`) and `SpacePageProps` (`acct`,
   `space`, `busy`, `run`).
2. `src/lib/edition.ts`: the public edition exports
   `spacePageAdditions = []`. Every edition must export it now.
3. `src/lib/SettingsDialog.svelte`: a space's tabs are General, Members,
   Ownership, then the edition's pages whose `visible` is true for that space.
   `#settings/spaces/<space>/<id>` opens one; an id the space doesn't show is
   treated as an unknown address. The page gets the account, the space and
   the dialog's `run`, so its changes show their notice, ask to confirm it's
   you on `step_up_needed`, and reload the account afterwards.
4. README: "Edition space pages".

No server change needed for the public edition. Checked by compiling the
changed Svelte file with the Svelte compiler on the laptop's Linux VM; `npm
run check` and the builds run in release-laptop.ps1.
