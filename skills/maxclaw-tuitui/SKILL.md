---
name: maxclaw-tuitui
description: Manage the explicitly enabled maxclaw Tuitui listener and inspect its status.
---

# maxclaw Tuitui

Check prerequisites before starting the listener: Node.js 20+ must run, `mcode --version` must
succeed, and MiniMax Code must already have a working provider configured. There is no
`maxclaw_initialize` tool; `maxclaw_status` reports whether credentials are configured and whether
the listener is running, and `maxclaw_settings_open` opens the settings page. Installation does not
start a listener. Never request or expose Tuitui credentials, LLM API keys, provider settings, or
secrets in chat. Starting the listener requires explicit user intent; stop it before uninstalling.

`maxclaw_listener_start` launches a separate user-level listener process
(`server.js --listener-service`); `maxclaw_listener_stop` sends SIGTERM to it and waits for exit.
`maxclaw_task_status` and `maxclaw_task_cancel` inspect and cancel tracked tasks. The listener uses
MiniMax Code's configured execution context. Treat `full` headless permissions as an explicit
remote-command and file-access risk, not a security sandbox. Do not claim that the plugin provides
per-action confirmation.
