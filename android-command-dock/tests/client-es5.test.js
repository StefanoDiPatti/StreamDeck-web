// Il tablet ha un browser Android 4: il JavaScript del client deve essere ES5
// e non usare API moderne. Questo test lo verifica a ogni modifica.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'public', 'js');
const CSS = path.join(__dirname, '..', 'public', 'css', 'dock.css');

let acorn = null;
try { acorn = require('acorn'); } catch (e) { acorn = null; }

const FORBIDDEN_JS = [
  [/\.startsWith\(|\.endsWith\(|\.includes\(/, 'metodi stringa/array ES6'],
  [/\.closest\(/, 'Element.closest'],
  [/\.classList\b/, 'classList'],
  [/querySelectorAll\([^)]*\)\.forEach/, 'NodeList.forEach'],
  [/\bfetch\(/, 'fetch'],
  [/\bPromise\b/, 'Promise'],
  [/\.bind\(/, 'Function.bind (assente su Android 4.0)'],
  [/\.find\(|\.findIndex\(/, 'Array.find'],
  [/Object\.assign|Array\.from/, 'Object.assign / Array.from'],
  [/new CustomEvent/, 'CustomEvent'],
  [/\{\s*passive\s*:/, 'opzioni passive negli event listener']
];

fs.readdirSync(JS_DIR).filter(function (f) { return /\.js$/.test(f); }).forEach(function (file) {
  const src = fs.readFileSync(path.join(JS_DIR, file), 'utf8');

  test(file + ': sintassi ES5', { skip: !acorn && 'acorn non installato (npm install)' }, function () {
    acorn.parse(src, { ecmaVersion: 5, sourceType: 'script' });
  });

  test(file + ': niente API moderne', function () {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    FORBIDDEN_JS.forEach(function (rule) {
      assert.ok(!rule[0].test(code), file + ' usa ' + rule[1]);
    });
  });
});

test('CSS senza flexbox, grid, gap, variabili e calc', function () {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  [/display\s*:\s*(flex|grid|inline-flex)/, /\bgap\s*:/, /var\(--/, /calc\(/].forEach(function (re) {
    assert.ok(!re.test(css), 'dock.css contiene ' + re);
  });
});
