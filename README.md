# classifica-film-site

Sito statico GitHub Pages per i report di classifica-film.

## Configurazione API

La pagina `classifica_film.html` puo' leggere la classifica dal backend `classifica-film`.
Il valore di default e':

```js
API_BASE_URL = "http://127.0.0.1:8000"
```

Per cambiarlo, modifica `site-config.js` oppure definisci `window.API_BASE_URL` prima di caricare la pagina.
Se l'API non risponde, il sito mantiene i dati statici gia' presenti nella pagina.

## Verifica manuale

1. Avvia il backend:

```bash
uvicorn cfr.api:app --reload
```

2. Servi questo sito statico, per esempio:

```bash
python -m http.server 8080
```

3. Apri `http://localhost:8080/classifica_film.html`.
4. Cambia citta' tra Roma, Milano e Napoli.
5. Verifica che titolo, data, `source` e tabella si aggiornino quando l'API risponde.
6. Ferma il backend e verifica che la pagina continui a mostrare i dati statici.
