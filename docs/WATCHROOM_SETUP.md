# Shared Watchroom setup

The Watchroom option opens the same reusable room and skips Watchroom’s create/join and name-entry page. Molomon retrieves the room credentials from its private Firebase access document after Google sign-in. Already signed-in approved accounts go straight into the room. The Google display name is used as the Watchroom name.

## Set the private room once

1. Finish [Shared notes setup](SHARED_NOTES_SETUP.md), including Google Authentication, the private two-account rules, and the `access/molomon` document with boolean `ready: true`. Keep the real account allowlist in the Firebase console only.
2. Publish the Watchroom version that supports reusable shared rooms (`shared=1`) and automatic entry (`auto=1`). The destination is `https://solomonmm876.github.io/watchroom/`.
3. Generate a fresh room ID and key privately. In a private browser tab’s developer console, this creates the two required random values:

   ```js
   const randomHex = bytes => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), value => value.toString(16).padStart(2, "0")).join("");
   ({ roomId: randomHex(16), roomSecret: randomHex(24) });
   ```

   Keep these values out of the repository, `config.js`, public screenshots, and shared logs. Generate them locally; do not use the example field names as values or choose a memorable key.

4. In Firebase console → Firestore Database → Data → `access` → `molomon`, add a **map** field named `watchroom`. Inside it add:

   | Field | Type | Value |
   | --- | --- | --- |
   | `roomId` | string | The 32-character lowercase hexadecimal room ID |
   | `roomSecret` | string | The 48-character lowercase hexadecimal room key |

   Keep the existing `ready` field set to boolean `true`. These fields are private data, not public Firebase web configuration. Existing rules allow only the two verified Google accounts to read this document; browser writes and collection listing remain denied. No rule change is needed.

5. Open Molomon → Watch → Watchroom on both devices. Sign in with each approved Google account if needed. Both should enter the same room without creating one or pasting an invitation. A third account must be denied by Firebase before it receives room credentials.

## How the reusable room works

The first person to arrive becomes the room host; the other joins that active host. There is no permanent host account and no invitation to resend for each visit. After both people leave, the next person to arrive hosts the same room again. The host must keep Watchroom open during the call. It is a live peer-to-peer room, so its chat and call do not continue running when both tabs close.

Room settings are read from the server on every launcher visit, kept in memory, and passed to Watchroom in the URL fragment. Molomon does not save those credentials in browser storage or its service-worker cache. The fragment is not sent in HTTP requests, but the Watchroom invitation remains sensitive: anyone who receives its room ID and key may try to join. Firebase protects retrieval through Molomon; it does not add Google authorization to Watchroom itself. Keep invitations private.

Camera, microphone, screen sharing, and audible playback still follow browser permissions. Automatic room entry does not automatically enable those devices. Some networks require a TURN relay, which can be configured in Watchroom’s connection settings.

To replace the reusable room, generate a new ID and key and update the private map in Firebase. Both people should leave the old room and reopen Watchroom through Molomon. A missing or invalid map produces a setup message instead of opening a different room.
