---
title: The link
description: Serve an instance, connect a replica, adapt your transport.
sidebar:
  order: 5
---

`@dendrite-lang/link` drives an instance across a channel: `serveInstance` on the host, `connectInstance` for a replica the editor cannot tell from a local one. The host owns the pipe by implementing `Channel` over whatever it already has. This page will be the protocol, the trust boundary, and a worked WebSocket host.
