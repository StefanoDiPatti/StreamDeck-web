// Lettura dell'elenco della posta in arrivo di Thunderbird in un thread a parte:
// i file .msf di Gmail arrivano a decine di MB e la lettura dura qualche secondo,
// che non deve bloccare la dock. Riceve { inbox, maildir }, risponde { messages } o { error }.
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');
const tb = require('./thunderbird');

function run(job) {
  const inbox = job.inbox;
  let messages = null;
  let msfError = '';
  if (fs.existsSync(inbox + '.msf')) {
    try {
      messages = tb.messagesFromMork(tb.parseMork(fs.readFileSync(inbox + '.msf', 'latin1')));
    } catch (e) { msfError = e.message; }
  }
  // senza .msf (o vuoto) si legge il file mbox stesso
  if ((!messages || !messages.length) && !job.maildir && fs.existsSync(inbox) && fs.statSync(inbox).isFile()) {
    messages = tb.messagesFromMbox(inbox);
  }
  if (!messages) return { error: msfError || 'missing' };
  return {
    messages: messages.map(function (m) { return Object.assign({}, m, { date: m.date.getTime() || 0 }); })
  };
}

let out;
try { out = run(workerData); } catch (e) { out = { error: e.message }; }
parentPort.postMessage(out);
