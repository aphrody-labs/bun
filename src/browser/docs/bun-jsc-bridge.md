<!-- SPDX-License-Identifier: Apache-2.0 -->

# Bun JSC page realm bridge

## Implemented source boundary

`BrowserRealm.create(htmlDocument, origin, frameId)` creates a bare
`JSGlobalContextRef` in the caller's JSC VM group. The realm owns only normal
ECMAScript intrinsics plus a read-only `__bunDOM` object; it receives no Bun,
process, require, fetch, filesystem, environment, or FFI globals. Origin and
frame ID are metadata attached to that realm, and `sourceURL` is evaluation
metadata. The host `HTMLDocument` wrapper and its JS values never cross into
the page realm.

The registry in `VirtualMachine` owns each context and a clone of the same
`Arc<DomTree>` used by `HTMLDocument`. `__bunDOM` callbacks cross a narrow C ABI
using UTF-8 arguments and JSON results. The exposed synchronous operations are
`querySelectorAll(selector)`, `outerHTML(nodeId?)`,
`textContent(nodeId?)`, `getAttribute(nodeId, name)`, and
`setAttribute(nodeId, name, value)`. They operate on the shared tree; node IDs
are document-local. The surface is deliberately smaller than `Document` and
must not be described as full DOM or browser parity.

`evaluate` returns the ECMAScript completion converted to a host string. That
conversion is part of the timed page execution because an object's
`toString()` can run arbitrary page code. DOM operation payloads use JSON only
to cross the native callback boundary.

Evaluation uses Bun's VM termination deadline. Bare page globals get a generic
JSC `Error` on timeout/interruption; Bun-specific ErrorCode cache paths are
not used. A collected wrapper posts only its VM-local resource ID to the owner
loop. The VM registry is authoritative, removes each ID at most once, and
releases remaining contexts before JSC VM teardown. Explicit `destroy()` is
idempotent.

## Integration and qualification status

The Rust/C++ bridge, class definition, VM registry, task dispatch, and focused
source tests are present. The Bun API registration/codegen hooks are owned by
the parent integration batch and must be applied before the API is callable.
No local build or test was run; compilation and behavior gates are reserved for
the SSH VPS. In particular, qualify the pinned JSC C API exports and these
cases there: DOM mutation visible through the host wrapper; host globals absent;
source URL/origin metadata; timeout during script and hostile result conversion
followed by successful host and page execution; explicit and GC teardown;
VM shutdown with queued finalizer work.

No async jobs, modules, memory quota, network/resource loading, navigation,
proxy enforcement, or full origin policy is implemented. The creator must be a
privileged page-owner path that has already selected and authorized the origin
and frame. `origin` is currently metadata, not an access-control decision.
Keep V8 behavior and source until JSC is qualified against its required cases.
