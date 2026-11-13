# Realtime rooms

Room broadcasts and presence run on a hibernating Cloudflare Durable Object. The
deploy manifest sets `"realtime": true`, which provisions a managed helper and
binds it as `REALTIME`; each environment gets its own. No account keys or npm SDK
are needed at runtime.

`worker.js` and `wrangler.jsonc` here are for **local testing only**. Never
upload the helper Worker as the site's Worker. `server.js` and `browser.js` are
the parts the app imports.

## Authorize tickets in an HTTP route

Import `createRealtimeTicket` from `./realtime/server.js` in server-side Worker
code. `POST /api/realtime/ticket` must parse JSON, identify the session, validate
the room, and query D1 to confirm the caller is a member of that room. Reject
unauthorized requests with 401/403. Never accept `userId`, `origin`, `publish` or
`presence` from the browser; choose capabilities on the server.

    const ticket = await createRealtimeTicket(env, {
      room, userId: player.sub, origin: APP_ORIGIN,
      publish: false, presence: true,
    });
    return Response.json(ticket, {
      headers: { 'Cache-Control': 'private, no-store' },
    });

Use the application's own origin, not a `Host` header. Tickets are single-use and
expire in 30 seconds. Sockets reconnect after five minutes, rechecking access
through this route. Sign-out should close the socket immediately.

## Connect in the browser

    import { connectRealtime } from './realtime/browser.js';
    const connection = connectRealtime({ room: 'game:123', onMessage(message) {
      if (message.type === 'ready') reloadAuthoritativeSnapshot();
      if (message.type === 'broadcast') applyEvent(message);
      if (message.type === 'presence') renderPresence(message.members);
    }});
    connection.close();

`ready` carries connectionId, userId, room, expiresAt and expiresInMs. The client
renews from the server's `expiresInMs`, so a skewed clock cannot cause a renewal
loop. `broadcast` carries event, data, userId and connectionId; `presence`
carries members. Messages are at most 16 KiB, presence data at most 1 KiB. A room
holds 32 connections, an environment 128 across 32 rooms.

Treat payloads as untrusted and render text safely. Broadcasts are ephemeral:
keep durable state in D1, reload a snapshot on every `ready`, and reconcile with
application revisions. Persist critical actions through an authenticated HTTP
mutation, then call `publishRealtime(env, { room, event, data })` after the
database write succeeds.

## Local workers preview

Add the binding to the app's local Wrangler configuration, preserving the others:

    "durable_objects": { "bindings": [{
      "name": "REALTIME", "class_name": "RookRealtime",
      "script_name": "rook-realtime-local"
    }] }

Start the helper first, then the app:

    npx wrangler dev --local -c realtime/wrangler.jsonc --inspector-port 9230
    npx wrangler dev --local -c wrangler.jsonc --inspector-port 9229

The helper listens on 8788 and the app on 8787. Use distinct inspector ports and
stop both when finished. Open two browser tabs, check broadcasts and presence,
reject a nonmember, then disconnect and reconnect to confirm snapshot recovery.
Local helper URLs use `ws://127.0.0.1:8788`.
