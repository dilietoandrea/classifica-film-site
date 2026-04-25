# classifica-film-site

Sito statico GitHub Pages per consultare i report pubblici di `classifica-film`.

## Verifica manuale catalogo citta

1. Apri il sito con l'API Cloud Run attiva.
2. Verifica che il selettore venga popolato chiamando `${API_BASE_URL}/api/cities`.
3. Usa il filtro citta per cercare una localita quando il catalogo contiene molte opzioni.
4. Cambia citta e verifica che solo la citta selezionata chiami `${API_BASE_URL}/api/ranking?city=${city}`.
5. Spegni o rendi non raggiungibile l'API e verifica il fallback statico Roma, Milano, Napoli.
6. Verifica che il cambio citta continui a mostrare messaggi non bloccanti in caso di errore API.
