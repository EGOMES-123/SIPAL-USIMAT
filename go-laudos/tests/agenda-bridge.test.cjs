const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, '../coletor-sap/agenda-bridge.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function boot(runtime, origin = 'https://go-laudos.netlify.app', framed = false) {
  const handlers = {}, posts = [], timers = [], calls = [];
  const window = { postMessage: (data, target) => posts.push({ data, target }), addEventListener: (name, cb) => handlers[name] = cb };
  window.top = framed ? {} : window;
  const context = { location: { origin }, window, document: { addEventListener: (name, cb) => handlers[name] = cb }, setTimeout: (cb, delay) => timers.push({ cb, delay }) };
  if (runtime) context.chrome = { runtime: { id: 'test-extension', sendMessage: async msg => { calls.push(msg); return runtime(msg); } } };
  vm.runInNewContext(code, context);
  return { handlers, posts, timers, calls, window };
}
test('missing runtime reports disconnected without throwing', async () => {
  const app = boot(); await flush();
  assert.equal(app.posts[0].data.kind, 'ready');
  assert.equal(app.posts[0].data.data.ok, false);
  assert.match(app.posts[0].data.data.error, /Recarregue/);
});
test('invalidated runtime and empty reply are handled', async () => {
  for (const runtime of [() => { throw Error('Extension context invalidated'); }, () => undefined]) {
    const app = boot(runtime); await flush(); assert.equal(app.posts[0].data.data.ok, false);
  }
});
test('other origins and subframes have no listeners or messages', async () => {
  for (const app of [boot(() => ({ok:true}), 'https://example.com'), boot(() => ({ok:true}), undefined, true)]) {
    await flush(); assert.equal(app.calls.length, 0); assert.equal(Object.keys(app.handlers).length, 0);
  }
});
test('trusted sync click wakes signed queue three times and is debounced', async () => {
  const app = boot(() => ({ok:true})); await flush();
  const target = { closest: () => ({ disabled:false, getAttribute: () => null }) };
  app.handlers.click({isTrusted:false,target}); assert.equal(app.timers.length,0);
  app.handlers.click({isTrusted:true,target}); app.handlers.click({isTrusted:true,target});
  assert.deepEqual(app.timers.map(t => t.delay),[0,1500,5000]);
  for (const timer of app.timers) await timer.cb();
  assert.equal(app.calls.filter(m => m.type === 'panel-sync-wake').length,3);
  assert.ok(app.calls.every(m => !['panel-start','robot-start'].includes(m.type)));
});
test('schedule changes preserve protocol and failures reach panel', async () => {
  const app = boot(msg => msg.type === 'panel-schedule-set' ? Promise.reject(Error('disconnected')) : {ok:true}); await flush();
  await app.handlers.change({isTrusted:true,target:{matches:()=>true,dataset:{scheduleTime:'08:00'},checked:true}});
  const result = app.posts.at(-1).data;
  assert.equal(result.kind,'saved'); assert.equal(result.data.hora,'08:00'); assert.equal(result.data.ok,false);
});
test('status accepts only messages from this panel window and origin', async () => {
  const app = boot(() => ({ok:true})); await flush();
  const event = { source:app.window, origin:'https://go-laudos.netlify.app', data:{source:'go-laudos-agenda-panel',kind:'status'} };
  app.handlers.message({...event,origin:'https://example.com'}); await flush(); assert.equal(app.calls.length,1);
  app.handlers.message(event); await flush(); assert.equal(app.calls.length,2);
});
