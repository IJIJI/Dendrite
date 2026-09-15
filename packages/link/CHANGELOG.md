# Changelog

Changes to `@dendrite-lang/link`, newest first. Each version's release date is on its
[GitHub release](https://github.com/IJIJI/Dendrite/releases), tagged `@dendrite-lang/link@<version>`.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API or the wire protocol. This package declares `@dendrite-lang/core` as a peer at
`^0.1.0`: a minor release of core needs a release here too, even if nothing in this package changed.

## 0.1.0

The first release.

- **`serveInstance`** drives a core `ProgramInstance` across a channel, and **`connectInstance`**
  returns a replica with the same five observables and four commands.
- **The protocol.** A handshake carrying a protocol version and a fingerprint of the language, so
  two builds that disagree are refused by name; sequence-stamped commands and pushes.
- **A replica that feels local.** Input changes echo immediately, stale pushes are dropped,
  outputs go stale when the channel drops, and a reconnect re-handshakes for fresh state.
- **The server is the trust boundary.** Layer policy is enforced there: no `setLayer` on a layer
  that is not editable, no `setInput` on a host-fed input. Refused and malformed commands are
  reported through `onError`, and type schemas never cross the wire.
- **Channels.** `messagePortChannel` for workers, iframes and `MessageChannel`, and
  `webSocketChannel` for WebSockets on either side. Any other transport is one `Channel` to
  implement.

Known limits: the replica does not analyse locally, two writers are not detected, and nothing is
queued while disconnected.
