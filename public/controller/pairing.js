import { db, auth } from '../shared/firebase.js';
import { signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { ref, get, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

const $ = s => document.querySelector(s);
const LEASE_MS = 20_000;
const HEARTBEAT_MS = 5_000;
const sessionId = new URL(location.href).searchParams.get('session');
let ownerId, lockToken, heartbeatTimer, unsubscribe, lost = false;
const message = $('#pairingMessage');
const connection = $('#connection');

function setMessage(text) { message.textContent = text; }
function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function signIn() { if (!auth.currentUser) await signInAnonymously(auth); }

async function release(status = 'disconnected') {
  if (!sessionId || !ownerId || !lockToken) return;
  clearInterval(heartbeatTimer);
  try {
    await runTransaction(ref(db, `controllerSessions/${sessionId}`), current => {
      // The owner ID AND acquisition token must match. A stale page cannot release a newer lock.
      if (!current || current.controller?.ownerId !== ownerId || current.controller?.lockToken !== lockToken) return;
      if (current.status === 'ended') return current;
      current.controller = { ownerId: null, authUid: null, lockToken: null, leaseUntil: 0, lastHeartbeat: Date.now() };
      current.status = status;
      return current;
    });
  } catch (e) { console.warn('Could not release controller lease; it will expire automatically.', e); }
}

async function heartbeat() {
  if (lost) return;
  const now = Date.now();
  try {
    const result = await runTransaction(ref(db, `controllerSessions/${sessionId}`), current => {
      if (!current || current.status === 'ended') return;
      const lock = current.controller || {};
      if (lock.ownerId !== ownerId || lock.lockToken !== lockToken) return;
      lock.leaseUntil = now + LEASE_MS;
      lock.lastHeartbeat = now;
      current.controller = lock;
      return current;
    });
    if (!result.committed) {
      lost = true; clearInterval(heartbeatTimer);
      setMessage('This controller session is no longer owned by this page. Another phone may have taken over.');
      connection.textContent = '● Session lock lost';
    }
  } catch (e) { console.warn('Heartbeat failed; lease expiry will recover the lock.', e); }
}

async function join() {
  if (!sessionId || !/^[a-f0-9-]{32,64}$/i.test(sessionId)) {
    setMessage('Invalid or missing session link. Scan the QR code displayed by the laptop admin.');
    connection.textContent = '● No session';
    return;
  }
  try {
    await signIn();
    ownerId = sessionStorage.getItem('dohControllerOwnerId');
    if (!ownerId) { ownerId = randomId(); sessionStorage.setItem('dohControllerOwnerId', ownerId); }
    const sessionRef = ref(db, `controllerSessions/${sessionId}`);
    const snap = await get(sessionRef);
    if (!snap.exists() || snap.val().status === 'ended') {
      setMessage('This session is unavailable or has ended. Ask the admin to generate a new QR code.');
      connection.textContent = '● Session unavailable';
      return;
    }
    const now = Date.now();
    const candidateToken = randomId();
    const result = await runTransaction(sessionRef, current => {
      if (!current || current.status === 'ended') return;
      const lock = current.controller || {};
      const validOwner = lock.ownerId && lock.leaseUntil > now;
      if (validOwner && lock.ownerId !== ownerId) return;
      // Refresh/retry from the same browser keeps its current lock token. Expired locks get a new token.
      lockToken = validOwner && lock.ownerId === ownerId && lock.lockToken ? lock.lockToken : candidateToken;
      lock.ownerId = ownerId;
      lock.authUid = auth.currentUser.uid;
      lock.lockToken = lockToken;
      lock.leaseUntil = now + LEASE_MS;
      lock.lastHeartbeat = now;
      current.controller = lock;
      current.status = 'pairing';
      return current;
    });
    if (!result.committed) {
      setMessage('Another phone already owns this controller session. Only one phone can control a game at a time.');
      connection.textContent = '● Controller already claimed';
      return;
    }
    setMessage('Controller reserved successfully. WebRTC connection has not yet been established; keep this page open.');
    connection.textContent = '● Pairing — WebRTC pending';
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
    unsubscribe = onValue(sessionRef, snapshot => {
      const current = snapshot.val();
      if (!current || current.status === 'ended') {
        clearInterval(heartbeatTimer);
        setMessage('The admin ended this session.');
        connection.textContent = '● Session ended';
        return;
      }
      if (current.controller?.ownerId !== ownerId || current.controller?.lockToken !== lockToken) {
        lost = true; clearInterval(heartbeatTimer);
        setMessage('Controller lock lost. This page can no longer control the session.');
        connection.textContent = '● Session lock lost';
      }
    });
  } catch (error) {
    setMessage(`Could not join session: ${error.message}. Check Firebase Authentication and Realtime Database rules.`);
    connection.textContent = '● Pairing error';
  }
}

window.addEventListener('pagehide', () => { if (unsubscribe) unsubscribe(); void release('disconnected'); });
join();
