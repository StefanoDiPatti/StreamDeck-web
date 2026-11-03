// TODO condivisi tra PC via git: fusione a tre vie e giro completo con una
// repo "GitHub" finta (repo bare in una cartella temporanea). Non tocca GitHub.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-sync-'));
process.env.DOCK_DATA_DIR = path.join(TMP, 'data');
process.env.LOG_LEVEL = 'error';
const todo = require('../server/services/todo');
const sync = require('../server/services/todosync');

function it(id, text, done, note) { return { id: id, text: text, done: !!done, note: note || 'n1', group: 'TODO:' }; }
function snap(items) { return { groups: [{ id: 'n1', title: 'TODO:' }], items: items }; }

test('fusione: modifiche dell\'altro PC (aggiunte, spunte, cancellazioni)', function () {
  const base = snap([it('a', 'Spesa'), it('b', 'Palestra'), it('c', 'Blender')]);
  const local = snap([it('a', 'Spesa'), it('b', 'Palestra'), it('c', 'Blender'), it('d', 'Nuova qui')]);
  const remote = snap([it('a', 'Spesa', true), it('c', 'Blender'), it('e', 'Nuova là')]);
  const ops = sync._merge(base, local, remote).map(function (o) { return o.type + ':' + o.item.id; }).sort();
  assert.deepStrictEqual(ops, ['add:e', 'remove:b', 'toggle:a']);
});

test('fusione: se cambia da entrambe le parti vince questo PC', function () {
  const base = snap([it('a', 'Spesa'), it('b', 'Palestra')]);
  const local = snap([it('a', 'Spesa', true), it('b', 'Palestra modificata')]);
  const remote = snap([it('a', 'Spesa', false), it('c', 'x')]);
  // b cancellata là ma modificata qui: resta. a uguale alla base là: niente da fare.
  const ops = sync._merge(base, local, remote).map(function (o) { return o.type + ':' + o.item.id; });
  assert.deepStrictEqual(ops, ['add:c']);
});

function git(cwd, args, input) {
  return execFileSync('git', args, { cwd: cwd, input: input, encoding: 'utf8', env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }) });
}

test('giro completo: questo PC e "l\'altro PC" si scambiano i TODO', async function () {
  const bare = path.join(TMP, 'github.git');
  const here = path.join(TMP, 'here');
  const other = path.join(TMP, 'other');
  git(TMP, ['init', '--bare', '-q', bare]);
  git(TMP, ['clone', '-q', bare, here]);
  git(TMP, ['clone', '-q', bare, other]);
  [here, other].forEach(function (d) {
    git(d, ['config', 'user.name', 'Test']);
    git(d, ['config', 'user.email', 'test@example.com']);
  });
  sync._setRepo(here);
  todo._setSource('local');
  todo.replaceLocal(snap([it('a', 'Spesa'), it('b', 'Palestra')]));

  // 1) primo giro: GitHub è vuoto, la lista di qui diventa quella condivisa
  let st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  git(other, ['fetch', '-q', 'origin', 'dock-todo']);
  let shared = JSON.parse(git(other, ['show', 'FETCH_HEAD:todo.json']));
  assert.deepStrictEqual(shared.items.map(function (i) { return i.text; }), ['Spesa', 'Palestra']);

  // 2) sull'altro PC: Spesa fatta, Palestra cancellata, una nuova
  shared.items = [Object.assign(shared.items[0], { done: true }), it('z', 'Dal Linux')];
  git(other, ['checkout', '-q', '-B', 'dock-todo', 'FETCH_HEAD']);
  fs.writeFileSync(path.join(other, 'todo.json'), JSON.stringify(shared));
  git(other, ['commit', '-q', '-am', 'da linux']);
  git(other, ['push', '-q', 'origin', 'dock-todo']);

  // 3) qui intanto se ne aggiunge una
  await todo.add('Da Windows', 'normal', 'n1');
  st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  const texts = todo.list().map(function (i) { return (i.done ? '[x] ' : '') + i.text; }).sort();
  assert.deepStrictEqual(texts, ['Da Windows', 'Dal Linux', '[x] Spesa']);

  // 4) GitHub ha la stessa lista
  git(other, ['fetch', '-q', 'origin', 'dock-todo']);
  shared = JSON.parse(git(other, ['show', 'FETCH_HEAD:todo.json']));
  assert.deepStrictEqual(shared.items.map(function (i) { return i.text; }).sort(), ['Da Windows', 'Dal Linux', 'Spesa']);
  assert.ok(shared.groups.length === 1 && shared.groups[0].title === 'TODO:');

  // 5) nessuna modifica: nessun commit nuovo
  const before = git(other, ['ls-remote', 'origin', 'dock-todo']);
  await sync.sync();
  assert.strictEqual(git(other, ['ls-remote', 'origin', 'dock-todo']), before);
});

test('primo giro su un PC nuovo: adotta la lista condivisa e salva la vecchia', async function () {
  fs.rmSync(path.join(process.env.DOCK_DATA_DIR, 'todo-sync.json'));
  todo.replaceLocal(snap([it('old', 'Vecchia lista locale')]));
  const st = await sync.sync();
  assert.strictEqual(st.ok, true, st.message);
  assert.deepStrictEqual(todo.list().map(function (i) { return i.text; }).sort(), ['Da Windows', 'Dal Linux', 'Spesa']);
  assert.ok(fs.existsSync(path.join(process.env.DOCK_DATA_DIR, 'todo.prima-della-sync.json')));
});
