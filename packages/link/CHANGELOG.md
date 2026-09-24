# Changelog

Changes to `@dendrite-lang/link`, newest first. Every version is tagged
`@dendrite-lang/link@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API or the wire protocol. This package declares `@dendrite-lang/core` as a peer at
`^0.3.0`: a minor release of core needs a release here too, even if nothing in this package changed.

## Unreleased

- **Breaking with core 0.4.0:** a `ProgramDiagnostic` on the wire carries the stage `"compose"`
  where it carried `"ports"`. A replica and its host move to 0.4.0 together.

## 0.3.0

- **No change.** The peer range moves to core `^0.3.0`.

## 0.2.0

- **`require()` works.** The entry gained a `default` export condition beside `import`, so
  `require("@dendrite-lang/link")` resolves. The package is still ESM, so this needs a Node that
  can `require()` an ES module (22.12 or later, or 20.19 or later).
- **The npm page** carries the Dendrite wordmark, and version, docs and licence badges.

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
