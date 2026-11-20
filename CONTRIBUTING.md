# Contribuire a Vibe Deck

Grazie! Idee, segnalazioni e modifiche sono benvenute. Ogni modifica entra nel progetto **solo dopo la verifica del
proprietario del repository**: puoi proporre tutto, ma il merge lo fa lui.

## Segnalare un problema o proporre un'idea

Apri una [issue](../../issues/new/choose) e scegli il modello:

- **Problema**: cosa hai fatto, cosa ti aspettavi, cosa è successo; sistema (Windows/Linux), tablet o telefono, tema e lingua.
  Togli dati personali da log e screenshot (codice di accesso, email, nomi).
- **Idea**: cosa vorresti fare dal tablet e su quale pagina.

## Proporre una modifica (pull request)

1. Fai un **fork** del repository e crea un branch dal `main` aggiornato, con un nome chiaro:
   `feature/pagina-obs`, `fix/audio-linux`, `docs/guida-plugin`.
2. Fai la modifica più piccola che risolve il problema. Per una funzione nuova valuta prima un **plugin**
   (`npm run new:widget -- <nome>`): non tocca il resto del progetto ed è più facile da accettare.
3. Rispetta le regole del progetto (le trovi anche in [AGENTS.md](AGENTS.md), utile se usi un assistente AI):
   - client del tablet in **ES5** e CSS **senza flexbox** (deve girare su Android 4);
   - dopo una modifica a `app/public/css/dock.css`: `npm run themes`;
   - testi nuovi del tablet in italiano **con la traduzione inglese** in `app/public/js/lang-en.js`;
   - tutto ciò che dipende dal sistema sia per **Windows** sia per **Linux**;
   - niente dati personali (usa `npm run demo` per prove e screenshot).
4. In `app/`: `npm install` e `npm test` (devono passare tutti).
5. Apri la **pull request** verso `main` compilando il modello: cosa cambia, come l'hai provato, cosa resta da
   provare dal vero (tablet, Discord, audio, finestre...).

Il proprietario la legge, può chiedere modifiche e la unisce quando è pronta. Nessuno, nemmeno chi ha accesso al
repository, può unire su `main` senza la sua approvazione.

## Licenza

Contribuendo accetti che il tuo codice sia distribuito con la licenza [MIT](LICENSE) del progetto.
