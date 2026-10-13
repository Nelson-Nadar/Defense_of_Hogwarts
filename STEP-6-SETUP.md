# Step 6 — Firebase session creation and QR pairing

This change adds the **session + atomic controller reservation layer**. It deliberately does not claim that WebRTC is connected: the admin says `pairing` until the later WebRTC step marks the session `connected` only after the data channel's `open` event. The existing game/controller transport is still the legacy WebSocket and must be migrated separately before Vercel is the only runtime.

## 1. Enable Firebase Anonymous Authentication

1. Open Firebase Console → **Authentication** → **Sign-in method**.
2. Enable **Anonymous** and save.
3. Open **Realtime Database** → **Rules**.
4. Publish the rules from `firebase/database.rules.json` (copy the full JSON into the Rules editor).
5. Keep the rules enabled. Do not use public read/write rules.

These rules allow an authenticated admin to create/end sessions and an authenticated controller to claim an unowned/expired session. The transaction is atomic; the lock also includes an owner ID, auth UID, random lock token and lease expiry.

## 2. Confirm Firebase configuration

`public/shared/firebase.js` already contains the Firebase web app configuration used by the project's Firebase test page. A Firebase web API key is not a server secret. Access control must come from Authentication and Database Rules, not from hiding that key.

## 3. Deploy and test

1. Deploy the project to Vercel (or run the static pages on HTTPS).
2. Open `/admin/` and press **Prepare Controller / Generate QR**.
3. Scan the QR code. It should open `/controller/?session=...` on the deployed HTTPS domain.
4. The admin should show `pairing` once the first phone reserves the session. This is **not yet WebRTC-connected**.
5. Open the same QR URL in a second browser/device. It should be rejected while the first phone's lease is valid.
6. Refresh the first phone. `sessionStorage` retains that tab's owner identity, so it can keep the same lock.
7. Close the first controller page. Its page-hide release is best-effort; if the browser is killed abruptly, the 20-second lease expires and another phone can claim the session.
8. After another phone takes over, the old page's lock token no longer matches, so its release/heartbeat cannot clear or renew the new lock.
9. Press **End Pairing Session** in admin and confirm new joins are rejected.

## 4. Important boundary before the next step

This is pairing/lease management only. The current `public/controller/controller.js` still opens the project's old WebSocket and sends laser coordinates over it. Do not treat its old WebSocket status as proof of a WebRTC connection. In the WebRTC migration step, create the peer connection, exchange SDP/ICE through Firebase, send coordinates over an RTCDataChannel, and transactionally change the session to `connected` only from the channel's `open` handler. On channel close, set `disconnected` and release only if both owner ID and lock token still match.

## Verification checklist

- [ ] QR points at deployed HTTPS URL and includes a session ID.
- [ ] No laptop IP is embedded in the URL.
- [ ] First phone claims the session; second phone is rejected.
- [ ] Refreshing the first tab keeps its reservation.
- [ ] Closing the first phone releases promptly or permits takeover after lease expiry.
- [ ] An old controller cannot release a newer controller's lock.
- [ ] Ending the session rejects joins.
- [ ] Admin displays `connected` only after WebRTC data channel `open` (to be implemented in the WebRTC step, not this step).
