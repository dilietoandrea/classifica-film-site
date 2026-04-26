const API_BASE_URL = String(
      window.CFR_SITE_CONFIG?.API_BASE_URL || window.API_BASE_URL || "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");
    const DEFAULT_CITY = "roma";
    const FALLBACK_CITIES = [
      { city: "roma", city_label: "Roma" },
      { city: "milano", city_label: "Milano" },
      { city: "napoli", city_label: "Napoli" },
    ];
    const titleElement = document.getElementById("ranking-title");
    const subtitleElement = document.getElementById("ranking-subtitle");
    const updatedElement = document.getElementById("ranking-updated");
    const statusElement = document.getElementById("api-status");
    const citySelect = document.getElementById("city-select");
    const cityFilter = document.getElementById("city-filter");
    const table = document.getElementById("classifica-table");
    const searchInput = document.getElementById("table-search");
    const counter = document.getElementById("table-counter");
    const tbody = table.tBodies[0];
    const headerCells = Array.from(table.querySelectorAll("thead th[aria-sort]"));
    const sortButtons = Array.from(table.querySelectorAll("thead .sort-button"));
    const staticSnapshot = {
      city: DEFAULT_CITY,
      title: titleElement.textContent,
      subtitle: subtitleElement.textContent,
      updated: updatedElement.textContent,
      rowsHtml: tbody.innerHTML,
    };
    let cityCatalog = FALLBACK_CITIES;
    let cityLabels = Object.fromEntries(FALLBACK_CITIES.map((city) => [city.city, city.city_label]));
    let activeCity = DEFAULT_CITY;
    let sortState = { column: null, direction: "ascending" };
    let loadCityRequestId = 0;

    function allRows() {
      return Array.from(tbody.rows);
    }

    function rowCountText(visible) {
      return `${visible} di ${tbody.rows.length} film`;
    }

    function updateCounter(visible) {
      counter.textContent = rowCountText(visible);
    }

    function setStatus(message, kind = "") {
      statusElement.textContent = message;
      statusElement.className = `api-status ${kind}`.trim();
    }

    function normalizeCityItem(item) {
      const city = String(item?.city || "").trim().toLocaleLowerCase("it-IT");
      const cityLabel = String(item?.city_label || "").trim();
      if (!city || !cityLabel) {
        return null;
      }
      const normalized = {
        city,
        city_label: cityLabel,
      };
      const region = String(item?.region || "").trim();
      const province = String(item?.province || "").trim();
      if (region) normalized.region = region;
      if (province && province !== cityLabel) normalized.province = province;
      return normalized;
    }

    function cityOptionLabel(city) {
      if (city.region) {
        return `${city.city_label} (${city.region})`;
      }
      if (city.province) {
        return `${city.city_label} (${city.province})`;
      }
      return city.city_label;
    }

    function refreshCityLabels() {
      cityLabels = Object.fromEntries(cityCatalog.map((city) => [city.city, city.city_label]));
    }

    function renderCityOptions(query = "") {
      const normalizedQuery = query.trim().toLocaleLowerCase("it-IT");
      const activeValue = citySelect.value || activeCity || DEFAULT_CITY;
      let visibleCities = cityCatalog.filter((city) => {
        if (!normalizedQuery) {
          return true;
        }
        return [city.city, city.city_label, city.region, city.province]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("it-IT")
          .includes(normalizedQuery);
      });
      const activeCityItem = cityCatalog.find((city) => city.city === activeValue);
      if (activeCityItem && !visibleCities.some((city) => city.city === activeCityItem.city)) {
        visibleCities = [activeCityItem, ...visibleCities];
      }
      citySelect.innerHTML = visibleCities
        .map((city) => `<option value="${escapeHtml(city.city)}">${escapeHtml(cityOptionLabel(city))}</option>`)
        .join("");
      citySelect.value = visibleCities.some((city) => city.city === activeValue)
        ? activeValue
        : DEFAULT_CITY;
    }

    function useCityCatalog(cities) {
      const normalizedCities = cities.map(normalizeCityItem).filter(Boolean);
      if (!normalizedCities.some((city) => city.city === DEFAULT_CITY)) {
        normalizedCities.unshift(FALLBACK_CITIES[0]);
      }
      cityCatalog = normalizedCities.length ? normalizedCities : FALLBACK_CITIES;
      refreshCityLabels();
      renderCityOptions(cityFilter?.value || "");
    }

    async function loadCityCatalog() {
      if (!API_BASE_URL) {
        useCityCatalog(FALLBACK_CITIES);
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/cities`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`API response ${response.status}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload.cities)) {
          throw new Error("Invalid city catalog");
        }
        useCityCatalog(payload.cities);
      } catch (error) {
        useCityCatalog(FALLBACK_CITIES);
        setStatus("Catalogo citta non raggiungibile. Uso Roma, Milano e Napoli.", "warn");
      }
    }

    function resetSortState() {
      sortState = { column: null, direction: "ascending" };
      for (const cell of headerCells) {
        cell.setAttribute("aria-sort", "none");
      }
      for (const button of sortButtons) {
        button.setAttribute("aria-pressed", "false");
      }
    }

    function updateFilter() {
      const query = searchInput.value.trim().toLocaleLowerCase("it-IT");
      let visible = 0;
      for (const row of allRows()) {
        const matches = !query || row.textContent.toLocaleLowerCase("it-IT").includes(query);
        row.hidden = !matches;
        if (matches) visible += 1;
      }
      updateCounter(visible);
    }

    function cellSortValue(row, columnIndex) {
      const cell = row.cells[columnIndex];
      if (!cell) {
        return "";
      }
      return cell.dataset.sortValue ?? cell.textContent.trim();
    }

    function compareRows(rowA, rowB, columnIndex, sortType) {
      const valueA = cellSortValue(rowA, columnIndex);
      const valueB = cellSortValue(rowB, columnIndex);
      if (sortType === "number") {
        const numberA = Number(valueA);
        const numberB = Number(valueB);
        const hasNumberA = Number.isFinite(numberA);
        const hasNumberB = Number.isFinite(numberB);
        if (hasNumberA && hasNumberB && numberA !== numberB) {
          return numberA - numberB;
        }
        if (hasNumberA !== hasNumberB) {
          return hasNumberA ? -1 : 1;
        }
      }
      return String(valueA).localeCompare(String(valueB), "it-IT", {
        numeric: true,
        sensitivity: "base",
      });
    }

    function updateSortState(columnIndex, direction) {
      for (const cell of headerCells) {
        cell.setAttribute("aria-sort", "none");
      }
      headerCells[columnIndex].setAttribute("aria-sort", direction);
      for (const button of sortButtons) {
        button.setAttribute("aria-pressed", "false");
      }
      sortButtons[columnIndex].setAttribute("aria-pressed", "true");
    }

    function sortBy(columnIndex, sortType) {
      const nextDirection =
        sortState.column === columnIndex && sortState.direction === "ascending"
          ? "descending"
          : "ascending";
      sortState = { column: columnIndex, direction: nextDirection };
      const rows = allRows();
      rows.sort((rowA, rowB) => {
        const result = compareRows(rowA, rowB, columnIndex, sortType);
        return nextDirection === "ascending" ? result : -result;
      });
      tbody.append(...rows);
      updateSortState(columnIndex, nextDirection);
      updateFilter();
    }

    function escapeHtml(value) {
      return String(value ?? "N.D.")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
    }

    function displayValue(value) {
      if (value === null || value === undefined || value === "") {
        return "N.D.";
      }
      return String(value);
    }

    function joinValues(value) {
      if (Array.isArray(value)) {
        return value.length ? value.join(", ") : "N.D.";
      }
      return displayValue(value);
    }

    function ratingToNumber(value) {
      if (value === null || value === undefined || value === "" || value === "N.D.") {
        return 0;
      }
      const number = Number(String(value).replace(",", "."));
      return Number.isFinite(number) ? number : 0;
    }

    function formatRating(value) {
      return ratingToNumber(value).toFixed(2).replace(".", ",");
    }

    function combineShowtimes(showtimeInfo) {
      if (!showtimeInfo || showtimeInfo === "N.D.") {
        return "N.D.";
      }
      if (Array.isArray(showtimeInfo)) {
        return showtimeInfo.length ? showtimeInfo.join(", ") : "N.D.";
      }
      if (typeof showtimeInfo !== "object") {
        return displayValue(showtimeInfo);
      }
      const normal = Array.isArray(showtimeInfo.orari) ? showtimeInfo.orari : [];
      const vo = Array.isArray(showtimeInfo.orari_vo) ? showtimeInfo.orari_vo : [];
      const parts = [];
      if (normal.length) parts.push(normal.join(", "));
      if (vo.length) parts.push(`VO: ${vo.join(", ")}`);
      return parts.length ? parts.join(" | ") : "N.D.";
    }

    function cellHtml(value, sortValue = value) {
      const text = displayValue(value);
      return `<td data-sort-value="${escapeHtml(sortValue)}">${escapeHtml(text).replace(/\n/g, "<br>")}</td>`;
    }

    function movieRow(movie) {
      const valutazioni = movie.valutazioni || {};
      const cinemaOrari = movie.cinema_orari || {};
      const cinemaNames = Object.keys(cinemaOrari);
      const showtimes = Object.values(cinemaOrari).map(combineShowtimes);
      const rating = ratingToNumber(valutazioni["MYMONETRO"]);
      const duration = Number(movie.durata_minuti);
      return "<tr>"
        + cellHtml(movie.titolo, displayValue(movie.titolo).toLocaleUpperCase("it-IT"))
        + cellHtml(formatRating(valutazioni["MYMONETRO"]), rating)
        + cellHtml(movie.consigliato)
        + cellHtml(joinValues(movie.genere))
        + cellHtml(joinValues(movie.paesi))
        + cellHtml(movie.anno)
        + cellHtml(movie.durata_minuti, Number.isFinite(duration) ? duration : "")
        + cellHtml(movie.trama)
        + cellHtml(joinValues(movie.regia))
        + cellHtml(joinValues(movie.cast))
        + cellHtml(cinemaNames.length ? cinemaNames.join("\n") : "N.D.", cinemaNames.join(" "))
        + cellHtml(showtimes.length ? showtimes.join("\n") : "N.D.", showtimes.join(" "))
        + "</tr>";
    }

    function sortedMovies(movies) {
      return [...movies].sort((movieA, movieB) => {
        const ratingA = ratingToNumber(movieA.valutazioni?.["MYMONETRO"]);
        const ratingB = ratingToNumber(movieB.valutazioni?.["MYMONETRO"]);
        if (ratingA !== ratingB) {
          return ratingB - ratingA;
        }
        return displayValue(movieA.titolo).localeCompare(displayValue(movieB.titolo), "it-IT", {
          numeric: true,
          sensitivity: "base",
        });
      });
    }

    function formatUpdatedAt(value) {
      if (!value) {
        return "data non disponibile";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function renderApiRanking(payload) {
      const movies = Array.isArray(payload.movies) ? payload.movies : [];
      const city = payload.city || activeCity || DEFAULT_CITY;
      const cityLabel = payload.city_label || cityLabels[city] || city;
      const source = payload.metadata?.source || "api";
      document.title = `Classifica film - ${cityLabel}`;
      titleElement.textContent = `Classifica film - ${cityLabel}`;
      subtitleElement.textContent = payload.subtitle || `Guida alla programmazione dei film in uscita nelle sale cinematografiche di ${cityLabel}.`;
      updatedElement.textContent = `Aggiornata il ${formatUpdatedAt(payload.updated_at)} - ${movies.length} film`;
      tbody.innerHTML = sortedMovies(movies).map(movieRow).join("");
      searchInput.value = "";
      resetSortState();
      updateFilter();
      activeCity = city;
      citySelect.value = city;
      setStatus(`source: ${source}`, "ok");
    }

    function restoreStaticFallback(message, kind = "warn") {
      document.title = staticSnapshot.title;
      titleElement.textContent = staticSnapshot.title;
      subtitleElement.textContent = staticSnapshot.subtitle;
      updatedElement.textContent = staticSnapshot.updated;
      tbody.innerHTML = staticSnapshot.rowsHtml;
      searchInput.value = "";
      resetSortState();
      updateFilter();
      activeCity = staticSnapshot.city;
      citySelect.value = staticSnapshot.city;
      setStatus(message, kind);
    }

    async function loadCity(city) {
      const requestId = ++loadCityRequestId;
      const cityLabel = cityLabels[city] || city;
      citySelect.disabled = true;
      setStatus(`Aggiornamento ${cityLabel}...`, "");
      try {
        const response = await fetch(`${API_BASE_URL}/api/ranking?city=${encodeURIComponent(city)}`, {
          headers: { Accept: "application/json" },
        });
        if (requestId !== loadCityRequestId) return;
        if (response.status === 429) {
          citySelect.value = activeCity;
          setStatus("Hai raggiunto il limite di aggiornamenti live. Riprova più tardi.", "error");
          return;
        }
        if (response.status === 400) {
          try {
            const errorPayload = await response.json();
            if (requestId !== loadCityRequestId) return;
            const errorDetail = errorPayload.detail || errorPayload;
            if (errorDetail.error_code === "ranking_not_available") {
              const message = errorDetail.message || `Classifica non disponibile per ${cityLabel}.`;
              setStatus(`${message} (${cityLabel})`, "error");
              return;
            }
          } catch (parseError) {
            // Continue to generic error handling below.
          }
        }
        if (!response.ok) {
          throw new Error(`API response ${response.status}`);
        }
        const payload = await response.json();
        if (requestId !== loadCityRequestId) return;
        renderApiRanking(payload);
      } catch (error) {
        if (requestId !== loadCityRequestId) return;
        restoreStaticFallback("API non raggiungibile. Mantengo i dati statici disponibili.", "warn");
      } finally {
        if (requestId === loadCityRequestId) {
          citySelect.disabled = false;
        }
      }
    }

    for (const button of sortButtons) {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        sortBy(Number(button.dataset.column), button.dataset.sortType);
      });
    }

    citySelect.addEventListener("change", () => {
      const selectedCity = citySelect.value || DEFAULT_CITY;
      if (selectedCity !== activeCity) {
        loadCity(selectedCity);
      }
    });

    if (cityFilter) {
      cityFilter.addEventListener("input", () => {
        renderCityOptions(cityFilter.value);
      });
    }

    loadCityCatalog();
    updateFilter();
