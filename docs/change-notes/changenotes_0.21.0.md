# Slate Viewer 0.21.0

## New

- **The sync chip opens a menu** instead of a message box. It shows the space and its state in full, **Sync now**, the space's recent activity from the sync log (it keeps updating while the menu is open), and the mtsync version. When sync isn't running it offers **Start syncing**, and when you're signed out **Sign in again…**. Escape or a click elsewhere closes it.
- **Sync now** asks mtsync to check this folder and the space straight away; the chip shows Syncing… until it has. It needs mtsync 0.70.0 (Metatrash 0.70.0); with an older mtsync the item says so.

## Changed

- **Sync is checked more often.** The chip's state is read every 3 seconds instead of 7, and with mtsync 0.70.0 its time is the last check rather than the last change, so "Synced · 09:45" keeps up with the clock while nothing is happening. mtsync 0.70.0 also looks for changes in the folder every 2 seconds instead of 5, so saves start uploading sooner.
