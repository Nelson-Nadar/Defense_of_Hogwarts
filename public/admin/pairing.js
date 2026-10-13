import { db, auth } from '../shared/firebase.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { ref, set, onValue, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

const $ = s => document.querySelector(s);
const status = $('#pairingStatus');
const prepare = $('#prepareController');
const endButton = $('#endControllerSession');
const details = $('#pairingDetails');
let currentSessionId = null;
let unsubscribe = null;

function newId() {
  return crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '') : [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function ensureAuth() {
  if (!auth.currentUser) await signInAnonymously(auth);
}

prepare.addEventListener('click', async () => {
  prepare.disabled = true;
  status.textContent = 'Creating a secure session…';
  try {
    await ensureAuth();
    if (unsubscribe) unsubscribe();
    const id = newId();
    const sessionRef = ref(db, `controllerSessions/${id}`);
    await set(sessionRef, {
      status: 'waiting',
      createdAt: Date.now(),
      createdBy: auth.currentUser.uid,
      controller: { ownerId: null, authUid: null, lockToken: null, leaseUntil: 0, lastHeartbeat: 0 }
    });
    currentSessionId = id;
    const url = new URL('/controller/', location.origin);
    url.searchParams.set('session', id);
    $('#controllerUrl').href = url.href;
    $('#controllerUrl').textContent = url.href;
    $('#controllerQr').replaceChildren();
    // qrcodejs is loaded by the parent page; wait briefly if its deferred script has not executed.
    if (!window.QRCode) await new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.QRCode) { clearInterval(timer); resolve(); }
        else if (Date.now() - started > 5000) { clearInterval(timer); reject(new Error('QR library did not load. You can still open/copy the controller URL above.')); }
      }, 50);
    });
    new window.QRCode($('#controllerQr'), { text: url.href, width: 220, height: 220, correctLevel: window.QRCode.CorrectLevel.M });
    details.classList.remove('hidden');
    endButton.disabled = false;
    status.textContent = 'Session waiting — scan the QR code with the phone.';
    unsubscribe = onValue(sessionRef, snap => {
      const data = snap.val();
      if (!data) { status.textContent = 'Session no longer exists.'; return; }
      const labels = { waiting: 'Waiting for a controller to scan the QR code.', pairing: 'Controller claimed the session; waiting for WebRTC to connect.', connected: 'Controller connected (WebRTC data channel usable).', disconnected: 'Controller disconnected. The session can be reclaimed after its lock is released or expires.', ended: 'Session ended; no new controllers can join.' };
      status.textContent = `Session ${data.status}: ${labels[data.status] || ''}`;
      if (data.status === 'ended') endButton.disabled = true;
    }, error => { status.textContent = `Firebase error: ${error.message}`; });
  } catch (error) {
    status.textContent = `Could not create session: ${error.message}`;
  } finally { prepare.disabled = false; }
});

endButton.addEventListener('click', async () => {
  if (!currentSessionId) return;
  endButton.disabled = true;
  try {
    await ensureAuth();
    const sessionRef = ref(db, `controllerSessions/${currentSessionId}`);
    await runTransaction(sessionRef, current => {
      if (!current || current.createdBy !== auth.currentUser.uid) return;
      current.status = 'ended';
      current.controller = { ownerId: null, authUid: null, lockToken: null, leaseUntil: 0, lastHeartbeat: Date.now() };
      return current;
    });
  } catch (error) { status.textContent = `Could not end session: ${error.message}`; endButton.disabled = false; }
});
