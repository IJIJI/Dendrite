//? @dendrite-lang/link - drive a ProgramInstance across a channel. A host serves one
// (serveInstance); an editor connects a replica (connectInstance) that IS a
// ProgramInstance. Dendrite owns the message shapes and both ends; the host owns the
// pipe by implementing Channel over whatever it already has, or takes an adapter.

export * from "./protocol"; // Channel, Command, Push, WireState, PROTOCOL, fingerprint, guards, codecs
export * from "./serve"; // serveInstance, ServeOptions, enforcePolicy, stripSchemas
export * from "./connect"; // connectInstance, RemoteInstance
export * from "./channels/message-port"; // messagePortChannel
