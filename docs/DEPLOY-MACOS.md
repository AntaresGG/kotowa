# Mac mini LAN deployment

The PC standalone checkout of AntaresGG/kotowa is the source of truth. The Mac origin remote must point to that repository and track main; the old AntaresGG/OpenJLPT remote may remain as fork for history. Commit and push changes to GitHub first, then pull the same revision on the Mac. Do not commit changes on the deployment host.

After the Kotowa rename, update an existing Mac checkout with `git remote set-url origin https://github.com/AntaresGG/kotowa.git`. Keep the existing deployment directory, `io.openjlpt.lan` service identifier and public site URL so bookmarks and browser progress continue to work. Repository branding does not require a deployment-directory migration.

The site is static. Build on PC/CI with `SITE_URL=http://LAN-IP:8086/`, using the actual private IP in local configuration only:

1. Run `npm run build:site -- <new-output-directory>`.
2. Run `uv run --no-project --with genanki python scripts/build_exports.py <new-output-directory>/downloads`.
3. Write `deployment.json` into that directory with exactly `{"revision":"<full git HEAD SHA>","site_url":"http://LAN-IP:8086/"}`.
4. Archive the directory contents with `tar -czf <archive> -C <new-output-directory> .`, and transfer the archive to the Mac.
5. On the Mac, clone/pull the branch from GitHub and ensure HEAD matches the archive. Install Caddy through Homebrew once. Include `/opt/homebrew/bin` in PATH.
6. Run `python3 scripts/deploy-macos.py --archive <archive> --bind <LAN-IP> --port 8086 --site-url http://LAN-IP:8086/` from the clean Mac checkout.

The deployer validates the revision, URL and required outputs, serves only the generated release directory, and binds Caddy to the chosen LAN address and loopback. No router port forwarding or public hosting is needed. Caddy static serving and binding behavior follow its [file server](https://caddyserver.com/docs/caddyfile/directives/file_server) and [bind](https://caddyserver.com/docs/caddyfile/directives/bind) documentation.

Releases live under `~/Services/openjlpt/releases`; `current` selects the live release and `previous` retains the prior release. Each deployment keeps old versions. Failed preparation directories are retained for diagnosis; clean up only verified unused releases.

`~/Library/LaunchAgents/io.openjlpt.lan.plist` starts the service when the user logs in and restarts it if it exits. This is a user login service, not a pre-login system daemon. Keep the Mac awake for availability. A DHCP reservation is recommended; if its LAN address changes, rebuild with the new SITE_URL and redeploy.

Verify from a second LAN device: homepage, Chinese search, grammar pages, flashcards, dataset and Anki download links. An absent file must return 404. Inspect service state with `launchctl print gui/$(id -u)/io.openjlpt.lan` and logs under `~/Services/openjlpt/logs`.

To stop: `launchctl bootout gui/$(id -u)/io.openjlpt.lan`. To start again: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.openjlpt.lan.plist`.

To roll back content on the same URL, atomically replace `current` with a symlink to the checked `previous` target using Python's `os.replace`; Caddy serves the selected directory on subsequent requests. Keep the corresponding previous Git revision for subsequent maintenance. Changes to the listening address/configuration require redeployment, not just a content rollback.

## Additional Tailscale access

Keep the LAN deployment and add a persistent, tailnet-only HTTPS proxy to its loopback listener. On the Mac, inspect existing mappings before choosing an unused HTTPS port:

```sh
TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
"$TS" serve status
"$TS" serve --bg --https=8446 http://127.0.0.1:8086
"$TS" serve status
```

Use the HTTPS URL printed by Serve from a device connected to the tailnet. Do not enable Funnel. Existing Serve mappings must be preserved. To remove only this endpoint, run `"$TS" serve --https=8446 off`; do not reset the shared Serve configuration. See the [Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

Navigation and download links resolve on the current origin, allowing both LAN and Tailscale access to the same release. `SITE_URL` remains the canonical URL used for metadata and copyable API examples. Yomitan's embedded update URL is also fixed at export time; use a reachable URL when building those exports (omit `SITE_URL` to use GitHub Release assets). Browser progress is stored per origin and does not automatically transfer between the LAN and Tailscale URLs.

Verify the HTTPS homepage, search data, grammar pages, flashcards, downloads and missing-file 404 from another tailnet device, then check the LAN endpoint again. Serve's background configuration persists across Tailscale restarts; the underlying Caddy service still requires the Mac user's login session.
