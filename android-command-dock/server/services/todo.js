// Todo list salvata in data/todo.json (scrittura atomica: file temporaneo + rename).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const paths = require('../paths');

const FILE = path.join(paths.DATA_DIR, 'todo.json');
const SEED = path.join(paths.DEFAULTS_DIR, 'todo.json');
let items = null;

function load() {
  if (items) return items;
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {
    try { raw = JSON.parse(fs.readFileSync(SEED, 'utf8')); } catch (e2) { raw = { items: [] }; }
  }
  items = (raw.items || []).filter(function (i) { return i && i.text; }).map(function (i) {
    return { id: String(i.id || crypto.randomBytes(4).toString('hex')), text: String(i.text), done: !!i.done, priority: i.priority === 'high' ? 'high' : 'normal' };
  });
  return items;
}

function save() {
  if (!fs.existsSync(paths.DATA_DIR)) fs.mkdirSync(paths.DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ items: items }, null, 2));
  fs.renameSync(tmp, FILE);
}

function find(id) {
  const list = load();
  for (let i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  const err = new Error('Attività non trovata');
  err.code = 'NOT_FOUND';
  throw err;
}

module.exports = {
  list: function () { return load(); },
  add: function (text, priority) {
    text = String(text || '').trim().slice(0, 200);
    if (!text) throw Object.assign(new Error('Testo vuoto'), { code: 'BAD_REQUEST' });
    const item = { id: crypto.randomBytes(4).toString('hex'), text: text, done: false, priority: priority === 'high' ? 'high' : 'normal' };
    load().push(item);
    save();
    return item;
  },
  toggle: function (id) { const it = find(id); it.done = !it.done; save(); return it; },
  remove: function (id) { find(id); items = load().filter(function (i) { return i.id !== String(id); }); save(); return true; },
  clearDone: function () { const before = load().length; items = load().filter(function (i) { return !i.done; }); save(); return before - items.length; },
  _reset: function () { items = null; }
};
