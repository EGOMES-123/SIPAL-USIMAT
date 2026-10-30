(() => {
  'use strict';
  if (location.origin !== 'https://go-laudos.netlify.app' || window !== window.top) return;
  // Content script only: do not load this file through a page <script> tag.
  const disconnected = 'Extensão desconectada. Recarregue a extensão e depois o painel.';
  const post = (kind, data) => window.postMessage({ source: 'go-laudos-agenda-extension', kind, data }, location.origin);
  const send = async message => {
    try {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime?.id || typeof runtime.sendMessage !== 'function') throw new Error(disconnected);
      const response = await runtime.sendMessage(message);
      if (!response || typeof response !== 'object') throw new Error(disconnected);
      return response;
    } catch {
      return { ok: false, error: disconnected };
    }
  };
  let infoFlight;
  const info = () => {
    if (!infoFlight) infoFlight = send({ type: 'panel-schedule-info' })
      .then(response => post('ready', response)).finally(() => { infoFlight = null; });
    return infoFlight;
  };
  let lastSyncClick = -Infinity;
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#syncNow');
    if (!event.isTrusted || !button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    if (Date.now() - lastSyncClick < 6000) return;
    lastSyncClick = Date.now();
    // Only wake the signed queue consumer. The panel request may still be in flight.
    for (const delay of [0, 1500, 5000]) setTimeout(async () => {
      const response = await send({ type: 'panel-sync-wake' });
      if (response.ok === false) post('ready', response);
    }, delay);
  }, true);
  document.addEventListener('change', async event => {
    const input = event.target;
    if (!event.isTrusted || !input?.matches?.('[data-schedule-time]')) return;
    const hora = input.dataset.scheduleTime;
    const response = await send({ type: 'panel-schedule-set', hora, marcado: input.checked });
    post('saved', { ...response, hora });
  }, true);
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin &&
        event.data?.source === 'go-laudos-agenda-panel' && event.data.kind === 'status') void info();
  });
  void info();
})();
