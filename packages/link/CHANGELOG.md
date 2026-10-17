# Changelog

Changes to `@dendrite-lang/link`, newest first. Every version is tagged
`@dendrite-lang/link@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API, and the three packages share a minor, so a minor release of any of them is a
release here too, even if nothing in this package changed. Before 1.0 a change of the wire
protocol may come in a patch: the protocol number moves with it, and a client and a server on
different numbers are refused at `hello` with both named, so update both ends together. After
1.0 such a change is a major. This package declares `@dendrite-lang/core` as a peer at `^0.8.2`.

## 0.8.1

- **Protocol 2: `setInputs` on the wire, in place of `setInput`.** One command carries one name
  or many: a replica's `setInput` and `setInputs` both send it, and the server applies it with
  `instance.setInputs`, all or none. A link 0.8.0 end and a 0.8.1 end are refused at `hello`
  with both protocol numbers named: update both ends together. A wire change in a patch, under
  the rule above.
- **New: `setInputs` on a replica.** One command and one echo into `values` (and `snapshot`) for
  the whole batch, as an instance publishes once. A batch the server refuses takes the whole
  echo back.
- **The server checks every name of a batch.** One name a `feeds: "host"` layer owns refuses
  the whole batch, as it refused one name before.
- **The peer range moves to core `^0.8.2`**: the server calls `instance.setInputs`, which core
  0.8.0 and 0.8.1 lack.

## 0.8.0

- **No change in the package.** The peer range moves to core `^0.8.0`. The fingerprint is
  unchanged: no op was added or removed.

## 0.7.1

- **A program over the wire is judged by core's own guard.** The protocol's `isSavedProgram` is
  core's now (exported in 0.7.1), one check stricter: an `ast` form must carry record
  `bindings` and `outputs`. No message that passed before is refused, and no test changed its
  outcome. The peer range moves to core `^0.7.1`, which is what makes the import safe.

## 0.7.0

- **No change in the package.** The peer range moves to core `^0.7.0`. The fingerprint is the
  names of the language's ops and types, and 0.7.0 adds none, so two ends on 0.6.0 and 0.7.0
  still shake hands; what differs between them is how `If`, `Default`, `And` and `Or` evaluate,
  which each end does for itself.

## 0.6.0

- **No change in the package.** The peer range moves to core `^0.6.0`.
- **With core 0.6.0: both ends need it.** The handshake's fingerprint is the sorted names of the
  language's ops and types, and core has seven new ops, so a 0.5.0 end and a 0.6.0 end are
  refused with the difference named, as any two builds that disagree are. The same holds for
  `createStdlib({ segments })`: a replica takes the segments its host takes.
- **With core 0.6.0: a local instance and a replica agree on a missing number.** An op result
  that was `NaN` or an infinity stayed itself in the host's process and over a MessagePort, and
  became `null` over a JSON channel. Core gives `null` for it now, before it leaves, and `0`
  for a negative zero.
- **The README's links** go to `dendrite-lang.org`.

## 0.5.0

- **A refused value is taken back.** Core now refuses a value that does not fit its input's
  type. A replica echoes `setInput` before the server answers, so the server follows a refused
  one with the real `values` and `snapshot`, and the `value_does_not_fit` diagnostic arrives
  beside them. Before core checked, the server stored whatever came.
- **With core 0.5.0:** a `ProgramDiagnostic` on the wire can carry the stage `"input"`.

## 0.4.0

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
