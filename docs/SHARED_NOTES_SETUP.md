# Shared notes setup

Molomon's website remains on GitHub Pages. Its static shell is publicly reachable. Shared books and notes use Firebase Authentication and Cloud Firestore, restricted by backend rules to your two verified Google accounts. No Firebase project or database has been created for you. Until setup is complete, Notes is clearly labeled **Device preview** and saves notes in that browser only. A hidden link or a password written into public JavaScript would not make the website private.

## Create the storage

1. Open the [Firebase console](https://console.firebase.google.com/) and create a project for Molomon.
2. Register a **Web app** in Project settings → Your apps. Firebase Hosting and Analytics are not needed: GitHub Pages continues to host the website.
3. Copy the public web configuration into `notes.firebase` in `config.js`:

   ```js
   notes: {
     firebase: {
       apiKey: "YOUR_WEB_API_KEY",
       authDomain: "YOUR_PROJECT.firebaseapp.com",
       projectId: "YOUR_PROJECT_ID",
       appId: "YOUR_WEB_APP_ID"
     }
   }
   ```

   The web config identifies the Firebase project; it is designed to be public. Access comes from Authentication and the database rules. Never add service-account keys, admin credentials, or a private key to this repository. [Firebase API key guidance](https://firebase.google.com/docs/projects/api-keys).

4. In Authentication → Sign-in method, enable **Google**, select a support email, and save. In Authentication → Settings → Authorized domains, add `solomonmm876.github.io`. For a local preview, add `localhost` and `127.0.0.1` if needed. Anonymous authentication is not used. [Google sign-in with Firebase](https://firebase.google.com/docs/auth/web/google-signin).
5. In Firestore Database, create a **Cloud Firestore Standard edition / Native mode** database and choose a location suitable for you. Start in production mode.
6. Open the Firestore **Rules** tab. Paste the complete contents of [`firestore.rules`](../firestore.rules). **In the Firebase console only**, replace `REPLACE_FIRST_GOOGLE_EMAIL` and `REPLACE_SECOND_GOOGLE_EMAIL` with the exact two Google account emails you want to permit, preserving the quotes. Press **Publish**. Keep the repository's rules file unchanged with placeholders; it denies all cloud access until you configure the console copy. Do not put your private email allowlist in `config.js` or commit the customized rules to the public repository.
7. In Firestore's **Data** tab, create collection `access`, document ID `molomon`, with a boolean field `ready` set to `true`. The browser must read this private document successfully from the server before showing cached private notes. Rules allow only the two configured Google accounts to read it; browser writes are denied.
8. Commit and push only the public web configuration in `config.js` to the `molomon` repository. Wait for its GitHub Pages workflow, then refresh Molomon.

These rules reject everyone outside the two verified Google accounts, including someone who knows the space invitation. They also prohibit listing spaces, removing memberships, arbitrary fields, oversized text, and writes with stale revisions. Server rules enforce access; the interface's sign-in screen is not the security boundary.

The app loads the pinned Firebase Web SDK `12.19.0` from Google's `gstatic` only for configured Google sign-in/shared storage. The unconfigured device preview loads no Firebase SDK. [Firebase web SDK setup](https://firebase.google.com/docs/web/alt-setup).

## Start your shared space

1. Open Notes and choose **Sign in with Google**, using one of your two permitted accounts. Other accounts receive “This Google account has not been given access.” Open **Settings** to set your name under **Writing as**.
2. In Settings, choose **Start shared notes**. Wait for **Shared notes · connected**.
3. Use **Copy link** in Settings to copy the private invitation and send it directly to your partner. Keep it out of `config.js`, the README, and any public link card.
4. Your partner opens that invitation, signs in with the other permitted Google account, sets their author name in Settings, and uses the same books and notes. The cloud keeps them even when neither page is open.
5. Bookmark the invitation privately on your other devices and sign in with the same Google account there. The space contains up to two account identities; multiple devices use the account's same identity.

An invitation contains a random 128-bit space ID that identifies a space. It grants no access to an unapproved account. There is no public space directory. Keep the link private so your space is easy to find only for you two. Google/Firebase operates the cloud storage; the notes are not end-to-end encrypted.

Signing out hides private notes and disconnects listeners. Clearing browser data removes cached notes and drafts, but your shared records remain in Firebase; sign back into the same approved Google account and reopen the invitation. Keep backups and a private copy of the invitation. Do not reuse this project's rules for more people without reviewing the authorization and membership design.

## Editing, offline use, and backups

- **Add book** creates a category tab. **Edit book** renames it or deletes it after confirmation. Deleting a book moves its notes into **General**; it does not delete their text. Arrow keys, Home, and End move between tabs.
- Selecting a book opens its white editing page directly. Notes within it have their own title tabs; select a tab to edit without an Open button or popup. **New note** starts another note in the selected book. Each line is one bullet point. Existing backups from before books were added import into General.
- **Save** writes one note at a time. Shared saves require a connection. Both people receive new versions through a live listener. Book names also use transaction revisions.
- If both people edit the same revision, the first save succeeds. The second editor keeps their draft and offers **Load latest** or **Save as new note**. There is no silent overwrite. A deletion leaves a revision marker so an old edit cannot recreate the deleted note. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).
- Switching book or note tabs keeps unfinished drafts in that device's browser storage. Select the note tab, or **New note** in its book, to resume a draft. **Save** keeps the editing page open. Once authorization has been confirmed in the current page, an offline connection leaves its cached notes readable. On a fresh page load, private cache stays hidden until a server authorization check succeeds; reconnect before reopening. Wait for the connected indicator, then press Save. Drafts do not transfer to the other device.
- **Export backup** downloads all notes and book assignments as JSON, including notes outside the selected tab. It includes text, authors, and timestamps; it omits room invitations and credentials.
- Invitations, connection controls, and backup import/export are under **Settings**. The main Notes page shows books and bullet lists, with a status line distinguishing shared storage from device notes.
- **Import backup** adds new copies after confirmation and preserves existing notes. This also moves device-only notes into a shared space: export in Device notes, open the shared space, and import. Imports allow up to 200 notes / 5 MB; titles allow 160 characters and bodies 20,000.
- If a cloud import stops partway through, its message reports the successful count. Re-importing adds duplicate copies, so remove the imported prefix from the backup before retrying, or delete the duplicates afterward.

## Verify your setup

Open the invitation in two separate browser profiles or on both phones, each signed into its approved Google account. Add a book and note from one side, edit them from the other, and verify both see the same data. Then open the same note in both editors: save different drafts in sequence and check that the second save reports a conflict while retaining its text. Check deletion and an exported/imported backup. Finally try a third Google account: it must fail the access check, see no private cached notes, and receive permission-denied from direct database reads and writes.

Use Firestore’s Rules Playground or the Firebase Emulator Suite to confirm these access cases before relying on the shared space:

- An unauthenticated request, anonymous identity, unverified email, or third Google account cannot read the access document, a space, its books, or its notes.
- An authenticated identity cannot list the `rooms` collection.
- A known invitation grants no access to an unapproved account. An approved account can append only its own Google UID; it cannot remove or impersonate the other member.
- An approved nonmember cannot list or read notes/books until joining the identified space. An enrolled member can create and edit within the schema limits.
- A stale revision, modified creator timestamp/identity, extra field, oversized title/body, or direct note deletion is rejected.

The rules and client transactions are included, but live cloud synchronization and rule enforcement cannot be verified until your Firebase project is configured. [Firestore rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions).

Monitor Firestore usage and Authentication in the Firebase console. Firebase limits and pricing can change; consult [Firestore pricing](https://firebase.google.com/docs/firestore/pricing) before selecting a billing plan. If shared storage is unavailable, device notes and JSON backups remain usable.
