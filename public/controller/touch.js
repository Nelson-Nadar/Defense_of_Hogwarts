(() => {
  const surface = document.querySelector('#touchSurface');
  const connection = document.querySelector('#connection');
  const connectionText = document.querySelector('#connectionText');
  const surfaceMessage = document.querySelector('#surfaceMessage');
  const surfaceContent = document.querySelector('#surfaceContent');
  let ws = null;
  let reconnectTimer = null;
  let pointerId = null;
  let active = false;
  let retryDelay = 500;
  let lastSentAt = 0;
  let lastPosition = { x: 0.5, y: 0.5 };

  function setConnection(connected, text) {
    connection.classList.toggle('connected', connected);
    connection.classList.toggle('disconnected', !connected);
    connectionText.textContent = text;
    surfaceMessage.textContent = connected ? 'Connected — swipe anywhere in this area' : 'Waiting for connection…';
  }

  function positionFromEvent(event) {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return lastPosition;
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  }

  function sendLaser(detected, position, force = false) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    // Avoid overwhelming the local server on devices that emit unusually many pointer events.
    if (!force && now - lastSentAt < 8) return;
    const message = { type: 'laser', detected, x: position.x, y: position.y, timestamp: Date.now() };
    ws.send(JSON.stringify(message));
    lastSentAt = now;
  }

  function stopSlash() {
    if (!active) return;
    active = false;
    surface.classList.remove('active');
    sendLaser(false, lastPosition, true);
    if (pointerId !== null) {
      try { if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId); } catch (_) {}
    }
    pointerId = null;
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
    clearTimeout(reconnectTimer);
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try { ws = new WebSocket(`${protocol}//${location.host}`); }
    catch (_) { scheduleReconnect(); return; }

    ws.addEventListener('open', () => {
      retryDelay = 500;
      ws.send(JSON.stringify({ type: 'hello', role: 'controller' }));
      setConnection(true, 'Connected');
      // Never resume a swipe that began before a connection interruption.
      active = false;
      surface.classList.remove('active');
    });
    ws.addEventListener('close', () => {
      stopSlash();
      setConnection(false, 'Reconnecting…');
      scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      setConnection(false, 'Connection error');
      try { ws.close(); } catch (_) {}
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      ws = null;
      connect();
    }, retryDelay);
    retryDelay = Math.min(5000, retryDelay * 1.5);
  }

  surface.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!ws || ws.readyState !== WebSocket.OPEN || pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    try { surface.setPointerCapture(pointerId); } catch (_) {}
    lastPosition = positionFromEvent(event);
    active = true;
    surface.classList.add('active');
    sendLaser(true, lastPosition, true);
  });

  surface.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== pointerId) return;
    event.preventDefault();
    // Send coalesced samples where available to preserve fast swipe paths.
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
    for (const sample of samples) {
      lastPosition = positionFromEvent(sample);
      sendLaser(true, lastPosition);
    }
  });

  surface.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    lastPosition = positionFromEvent(event);
    stopSlash();
  });
  surface.addEventListener('pointercancel', stopSlash);
  surface.addEventListener('lostpointercapture', () => {
    if (active) {
      active = false;
      pointerId = null;
      surface.classList.remove('active');
      sendLaser(false, lastPosition, true);
    }
  });
  window.addEventListener('blur', stopSlash);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSlash();
  });
  window.addEventListener('pagehide', stopSlash);

  // Keep the interface in a safe inactive state if the connection drops mid-swipe.
  const observer = new MutationObserver(() => {
    if (ws?.readyState !== WebSocket.OPEN && active) stopSlash();
  });
  observer.observe(connection, { attributes: true, attributeFilter: ['class'] });

  setConnection(false, 'Connecting…');
  connect();
})();
