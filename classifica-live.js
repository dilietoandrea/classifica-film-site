// 1. Constants and DOM references
    const API_BASE_URL = String(
      window.CFR_SITE_CONFIG?.API_BASE_URL || window.API_BASE_URL || "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");
    const DEFAULT_CITY = "roma";
    const USER_ORIGIN_STORAGE_KEY = "CFR_USER_ORIGIN";
    const FALLBACK_CITIES = [
      { city: "roma", city_label: "Roma" },
      { city: "milano", city_label: "Milano" },
      { city: "napoli", city_label: "Napoli" },
    ];
    const titleElement = document.getElementById("ranking-title");
    const subtitleElement = document.getElementById("ranking-subtitle");
    const updatedElement = document.getElementById("ranking-updated");
    const statusElement = document.getElementById("api-status");
    const apiVersionElement = document.getElementById("api-version");
    const citySelect = document.getElementById("city-select");
    const cityFilter = document.getElementById("city-filter");
    const comboboxResultsContainer = document.getElementById("city-combobox-results");
    const table = document.getElementById("classifica-table");
    const searchInput = document.getElementById("table-search");
    const showtimeStart = document.getElementById("showtime-start");
    const showtimeEnd = document.getElementById("showtime-end");
    const showtimeReset = document.getElementById("showtime-reset");
    const counter = document.getElementById("table-counter");
    const tbody = table.tBodies[0];
    const headerCells = Array.from(table.querySelectorAll("thead th[aria-sort]"));
    const sortButtons = Array.from(table.querySelectorAll("thead .sort-button"));
    const CINEMA_COLUMN_INDEX = 10;
    const SHOWTIME_COLUMN_INDEX = 11;
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
    let pendingCity = null;
    let visibleCityOptions = [];
    let highlightedCityIndex = -1;
    let isCityListOpen = false;
    let originInput = null;
    let originApplyButton = null;
    let originRemoveButton = null;
    let distanceOriginInfo = null;
    let storedUserOrigin = readStoredUserOrigin();

    // 2. Status and version helpers
    function setStatus(message, kind = "") {
      statusElement.textContent = message;
      statusElement.className = `api-status ${kind}`.trim();
    }

    function setApiVersion(message, kind = "") {
      if (!apiVersionElement) {
        return;
      }
      apiVersionElement.textContent = message;
      if (kind) {
        apiVersionElement.dataset.status = kind;
      } else {
        delete apiVersionElement.dataset.status;
      }
    }

    function readStoredUserOrigin() {
      try {
        return String(window.localStorage?.getItem(USER_ORIGIN_STORAGE_KEY) || "").trim();
      } catch (error) {
        return "";
      }
    }

    function writeStoredUserOrigin(value) {
      try {
        const text = String(value || "").trim();
        if (text) {
          window.localStorage?.setItem(USER_ORIGIN_STORAGE_KEY, text);
        } else {
          window.localStorage?.removeItem(USER_ORIGIN_STORAGE_KEY);
        }
      } catch (error) {
        // localStorage may be blocked by the browser; distance calculation still works for the current page.
      }
    }

    function currentUserOrigin() {
      return String(originInput?.value || storedUserOrigin || "").trim();
    }

    function setDistanceOriginInfo(message, kind = "") {
      if (!distanceOriginInfo) {
        return;
      }
      distanceOriginInfo.textContent = message || "";
      distanceOriginInfo.className = `distance-origin-info ${kind}`.trim();
      if (message) {
        distanceOriginInfo.removeAttribute("hidden");
      } else {
        distanceOriginInfo.setAttribute("hidden", "hidden");
      }
    }

    function updateOriginButtons() {
      const hasOrigin = Boolean(currentUserOrigin());
      if (originApplyButton) {
        originApplyButton.disabled = !hasOrigin || pendingCity !== null;
      }
      if (originRemoveButton) {
        originRemoveButton.hidden = !hasOrigin;
        originRemoveButton.disabled = pendingCity !== null;
      }
    }

    function injectDistanceControlStyles() {
      if (typeof document.createElement !== "function" || !document.head) {
        return;
      }
      const existing = document.getElementById("distance-origin-styles");
      if (existing && existing.id === "distance-origin-styles") {
        return;
      }
      const style = document.createElement("style");
      style.id = "distance-origin-styles";
      style.textContent = `
        .distance-origin-input { width: min(340px, 100%); }
        .distance-origin-info {
          min-height: 22px;
          margin: -6px 0 14px;
          color: var(--muted);
          font-size: 13px;
        }
        .distance-origin-info.warn { color: #8a4b00; }
        .distance-origin-remove[hidden],
        .distance-origin-info[hidden] { display: none; }
      `;
      document.head.appendChild(style);
    }

    function ensureDistanceControls() {
      const existingInput = document.getElementById("distance-origin-input");
      if (existingInput && existingInput.id === "distance-origin-input") {
        originInput = existingInput;
        originApplyButton = document.getElementById("distance-origin-apply");
        originRemoveButton = document.getElementById("distance-origin-remove");
        distanceOriginInfo = document.getElementById("distance-origin-info");
        return;
      }
      if (typeof document.createElement !== "function" || typeof document.querySelector !== "function") {
        return;
      }

      const toolbarTools = document.querySelector(".toolbar-tools");
      if (!toolbarTools) {
        return;
      }

      injectDistanceControlStyles();

      const label = document.createElement("label");
      label.className = "field-label";
      label.htmlFor = "distance-origin-input";
      label.textContent = "Indirizzo di partenza";

      originInput = document.createElement("input");
      originInput.className = "distance-origin-input search";
      originInput.id = "distance-origin-input";
      originInput.type = "search";
      originInput.placeholder = "Indirizzo di partenza";
      originInput.autocomplete = "street-address";

      originApplyButton = document.createElement("button");
      originApplyButton.className = "showtime-reset distance-origin-apply";
      originApplyButton.id = "distance-origin-apply";
      originApplyButton.type = "button";
      originApplyButton.textContent = "Calcola distanze";

      originRemoveButton = document.createElement("button");
      originRemoveButton.className = "showtime-reset distance-origin-remove";
      originRemoveButton.id = "distance-origin-remove";
      originRemoveButton.type = "button";
      originRemoveButton.textContent = "Rimuovi";

      const insertBefore = searchInput && searchInput.parentNode === toolbarTools ? searchInput : null;
      for (const element of [label, originInput, originApplyButton, originRemoveButton]) {
        toolbarTools.insertBefore(element, insertBefore);
      }

      distanceOriginInfo = document.createElement("p");
      distanceOriginInfo.className = "distance-origin-info";
      distanceOriginInfo.id = "distance-origin-info";
      distanceOriginInfo.setAttribute("hidden", "hidden");
      statusElement.insertAdjacentElement?.("afterend", distanceOriginInfo);
    }

    function persistUserOrigin(value) {
      storedUserOrigin = String(value || "").trim();
      writeStoredUserOrigin(storedUserOrigin);
      updateOriginButtons();
    }

    function applyUserOrigin() {
      const origin = currentUserOrigin();
      if (!origin) {
        removeUserOrigin();
        return;
      }
      if (originInput) {
        originInput.value = origin;
      }
      persistUserOrigin(origin);
      loadCity(activeCity || citySelect.value || DEFAULT_CITY);
    }

    function removeUserOrigin() {
      if (originInput) {
        originInput.value = "";
      }
      persistUserOrigin("");
      setDistanceOriginInfo("");
      loadCity(activeCity || citySelect.value || DEFAULT_CITY);
    }

    function rankingApiUrl(city, origin = currentUserOrigin()) {
      const params = [`city=${encodeURIComponent(city || DEFAULT_CITY)}`];
      const originText = String(origin || "").trim();
      if (originText) {
        params.push(`origin=${encodeURIComponent(originText)}`);
      }
      return `${API_BASE_URL}/api/ranking?${params.join("&")}`;
    }

    function geocodingOriginErrorMessage(errorDetail) {
      const code = String(errorDetail?.error_code || errorDetail?.code || "").toLowerCase();
      const field = String(errorDetail?.field || "").toLowerCase();
      const message = String(errorDetail?.message || errorDetail?.detail || "").toLowerCase();
      if (field === "origin" || code.includes("origin") || message.includes("origin")) {
        return "Non riesco a calcolare le distanze: indirizzo di partenza non trovato.";
      }
      return "";
    }

    function updateDistanceOriginInfo(payload) {
      const origin = currentUserOrigin();
      if (!origin) {
        setDistanceOriginInfo("");
        return;
      }
      if (payload?.metadata?.distance_origin_geocoded === false) {
        setDistanceOriginInfo("Non riesco a calcolare le distanze: indirizzo di partenza non trovato.", "warn");
        setStatus("Non riesco a calcolare le distanze: indirizzo di partenza non trovato.", "warn");
        return;
      }
      setDistanceOriginInfo(`Distanze in linea d\u2019aria da: ${origin}`);
    }

    async function loadApiVersion() {
      if (!API_BASE_URL) {
        setApiVersion("non configurata", "warn");
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/api/version`, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`API response ${response.status}`);
        }
        const payload = await response.json();
        const version = String(payload?.version || "").trim();
        if (!version) {
          throw new Error("Invalid API version");
        }
        setApiVersion(version, "ok");
      } catch (error) {
        setApiVersion("non raggiungibile", "warn");
      }
    }

    // 3. City catalog and combobox helpers
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

    function cityMatchesQuery(city, normalizedQuery) {
      if (!normalizedQuery) {
        return true;
      }
      return [city.city, city.city_label, city.region, city.province]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("it-IT")
        .includes(normalizedQuery);
    }

    function refreshCityLabels() {
      cityLabels = Object.fromEntries(cityCatalog.map((city) => [city.city, city.city_label]));
    }

    function renderCityOptions(query = "") {
      renderCityResults(query);
    }

    function openCityResults() {
      isCityListOpen = true;
      cityFilter.setAttribute("aria-expanded", "true");
      comboboxResultsContainer.setAttribute("aria-hidden", "false");
      highlightedCityIndex = -1;
    }

    function closeCityResults() {
      isCityListOpen = false;
      cityFilter.setAttribute("aria-expanded", "false");
      comboboxResultsContainer.setAttribute("aria-hidden", "true");
      highlightedCityIndex = -1;
      cityFilter.removeAttribute("aria-activedescendant");
    }

    function highlightCityResult(index) {
      highlightedCityIndex = index;
      const resultItems = comboboxResultsContainer.querySelectorAll("[role='option']");
      resultItems.forEach((item, i) => {
        item.setAttribute("aria-selected", i === index ? "true" : "false");
      });
      if (index >= 0 && index < resultItems.length) {
        resultItems[index].scrollIntoView({ block: "nearest" });
        cityFilter.setAttribute("aria-activedescendant", resultItems[index].id);
      } else {
        cityFilter.removeAttribute("aria-activedescendant");
      }
    }

    function selectCity(city) {
      if (!city) return;
      citySelect.value = city.city;
      cityFilter.value = city.city_label;
      closeCityResults();
      if (city.city !== activeCity && city.city !== pendingCity) {
        loadCity(city.city);
      }
    }

    function renderCityResults(query = "") {
      const normalizedQuery = query.trim().toLocaleLowerCase("it-IT");
      const matchingCities = cityCatalog.filter((city) => cityMatchesQuery(city, normalizedQuery));
      visibleCityOptions = matchingCities;
      highlightedCityIndex = -1;
      if (!matchingCities.length) {
        comboboxResultsContainer.innerHTML = '<div role="option" class="city-result" style="cursor: default; pointer-events: none;">Nessuna città trovata</div>';
        if (isCityListOpen) openCityResults();
        return;
      }
      comboboxResultsContainer.innerHTML = matchingCities
        .map((city, index) => `<div id="city-result-${index}" role="option" class="city-result" data-city="${escapeHtml(city.city)}" aria-selected="false">${escapeHtml(cityOptionLabel(city))}</div>`)
        .join("");
      const resultItems = comboboxResultsContainer.querySelectorAll("[role='option'][data-city]");
      resultItems.forEach((item) => {
        item.addEventListener("click", () => {
          const cityValue = item.getAttribute("data-city");
          const selectedCity = cityCatalog.find((c) => c.city === cityValue);
          if (selectedCity) selectCity(selectedCity);
        });
        item.addEventListener("mouseenter", () => {
          const index = Array.from(resultItems).indexOf(item);
          highlightCityResult(index);
        });
      });
      if (isCityListOpen) openCityResults();
    }

    function selectBestFilteredCity() {
      const query = cityFilter.value.trim().toLocaleLowerCase("it-IT");
      if (!query || !visibleCityOptions.length) {
        return;
      }
      let chosen = visibleCityOptions.find((city) =>
        city.city.toLocaleLowerCase("it-IT") === query ||
        city.city_label.toLocaleLowerCase("it-IT") === query
      );
      if (!chosen) {
        chosen = visibleCityOptions[0];
      }
      if (chosen) {
        selectCity(chosen);
      }
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

    // 4. Showtime filtering helpers
    function parseHourSelect(value) {
      const match = String(value || "").match(/^([01]?\d|2[0-3])(?::00)?$/);
      if (!match) {
        return null;
      }
      return Number(match[1]) * 60;
    }

    function currentShowtimeRange() {
      const start = parseHourSelect(showtimeStart?.value);
      const end = parseHourSelect(showtimeEnd?.value);
      return {
        start,
        end,
        active: start !== null || end !== null,
      };
    }

    function showtimeInRange(minutes, range) {
      if (!range.active) return true;
      if (range.start !== null && range.end !== null) {
        if (range.start <= range.end) {
          return minutes >= range.start && minutes <= range.end;
        }
        return minutes >= range.start || minutes <= range.end;
      }
      if (range.start !== null) return minutes >= range.start;
      if (range.end !== null) return minutes <= range.end;
      return true;
    }

    function filteredShowtimeText(value, range) {
      if (!value || value === "N.D.") {
        return "";
      }
      const timePattern = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g;
      const lines = String(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const filteredLines = lines.map((line) => {
        const parts = line.split("|").map((part) => part.trim()).filter(Boolean);
        const filteredParts = parts.map((part) => {
          const isVo = /^VO:\s*/i.test(part);
          const matchingTimes = Array.from(part.matchAll(timePattern))
            .filter((match) => showtimeInRange(Number(match[1]) * 60 + Number(match[2]), range))
            .map((match) => match[0]);
          if (!matchingTimes.length) {
            return "";
          }
          return `${isVo ? "VO: " : ""}${matchingTimes.join(", ")}`;
        }).filter(Boolean);
        return filteredParts.join(" | ");
      }).filter(Boolean);
      return filteredLines.join("\n");
    }

    function parseShowtimeGroups(row) {
      try {
        const groups = JSON.parse(row.dataset.showtimeGroups || "[]");
        if (!Array.isArray(groups)) {
          return [];
        }
        return groups
          .map((group) => ({
            cinema: String(group?.cinema || "").trim(),
            showtimes: String(group?.showtimes || "").trim(),
          }))
          .filter((group) => group.cinema || group.showtimes);
      } catch (error) {
        return [];
      }
    }

    function showtimeGroupsHtml(groups, field) {
      if (!groups.length) {
        return "N.D.";
      }
      return '<div class="showtime-groups">'
        + groups.map((group, index) => (
          `<div class="showtime-group" data-showtime-index="${index}">${escapeHtml(group[field] || "N.D.").replace(/\n/g, "<br>")}</div>`
        )).join("\n")
        + "</div>";
    }

    function showtimeCellHtml(groups, field, sortValue) {
      return `<td data-sort-value="${escapeHtml(sortValue)}">${showtimeGroupsHtml(groups, field)}</td>`;
    }

    function showtimeGroupElements(cell) {
      if (!cell || typeof cell.querySelectorAll !== "function") {
        return [];
      }
      return Array.from(cell.querySelectorAll(".showtime-group"));
    }

    function elementHeight(element) {
      if (element && typeof element.getBoundingClientRect === "function") {
        return element.getBoundingClientRect().height;
      }
      return Number(element?.offsetHeight) || 0;
    }

    function syncShowtimeGroupHeights(row) {
      const cinemaGroups = showtimeGroupElements(row.cells[CINEMA_COLUMN_INDEX]);
      const showtimeGroups = showtimeGroupElements(row.cells[SHOWTIME_COLUMN_INDEX]);
      for (const group of [...cinemaGroups, ...showtimeGroups]) {
        if (group.style) {
          group.style.minHeight = "";
        }
      }
      const groupCount = Math.min(cinemaGroups.length, showtimeGroups.length);
      for (let index = 0; index < groupCount; index += 1) {
        const height = Math.max(elementHeight(cinemaGroups[index]), elementHeight(showtimeGroups[index]));
        if (height > 0 && cinemaGroups[index].style && showtimeGroups[index].style) {
          cinemaGroups[index].style.minHeight = `${height}px`;
          showtimeGroups[index].style.minHeight = `${height}px`;
        }
      }
    }

    function syncVisibleShowtimeGroupHeights() {
      for (const row of allRows()) {
        if (!row.hidden) {
          syncShowtimeGroupHeights(row);
        }
      }
    }

    function renderShowtimeGroups(row, groups) {
      const cinemaCell = row.cells[CINEMA_COLUMN_INDEX];
      const showtimeCell = row.cells[SHOWTIME_COLUMN_INDEX];
      if (!cinemaCell || !showtimeCell) {
        return true;
      }
      cinemaCell.innerHTML = showtimeGroupsHtml(groups, "cinema");
      showtimeCell.innerHTML = showtimeGroupsHtml(groups, "showtimes");
      return groups.length > 0;
    }

    function updateShowtimeCells(row, range) {
      const groups = parseShowtimeGroups(row);
      if (!range.active) {
        renderShowtimeGroups(row, groups);
        return true;
      }
      const filteredGroups = filteredShowtimeGroups(groups, range);
      renderShowtimeGroups(row, filteredGroups);
      return filteredGroups.length > 0;
    }

    function filteredShowtimeGroups(groups, range) {
      return groups
        .map((group) => ({
          cinema: group.cinema,
          showtimes: filteredShowtimeText(group.showtimes, range),
        }))
        .filter((group) => group.showtimes);
    }

    function matchesShowtimeFilter(row, range) {
      return updateShowtimeCells(row, range);
    }

    // 5. Table filtering and sorting helpers
    function allRows() {
      return Array.from(tbody.rows);
    }

    function rowCountText(visible) {
      return `${visible} di ${tbody.rows.length} film`;
    }

    function updateCounter(visible) {
      counter.textContent = rowCountText(visible);
    }

    function rowMatchesText(row, query) {
      if (!query) {
        return true;
      }
      return row.textContent.toLocaleLowerCase("it-IT").includes(query);
    }

    function updateFilter() {
      const query = searchInput.value.trim().toLocaleLowerCase("it-IT");
      const showtimeRange = currentShowtimeRange();
      let visible = 0;
      for (const row of allRows()) {
        const matchesShowtime = matchesShowtimeFilter(row, showtimeRange);
        const matchesText = rowMatchesText(row, query);
        const matches = matchesText && matchesShowtime;
        row.hidden = !matches;
        if (matches) visible += 1;
      }
      syncVisibleShowtimeGroupHeights();
      updateCounter(visible);
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

    // 6. API rendering and fallback helpers
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

    function optionalText(value) {
      const text = String(value ?? "").trim();
      return text && text !== "N.D." ? text : "";
    }

    function cinemaLabelWithDetails(cinema, showtimeInfo) {
      const lines = [optionalText(cinema)].filter(Boolean);
      const address = optionalText(showtimeInfo?.indirizzo);
      const distance = optionalText(showtimeInfo?.distance_label);
      if (address) lines.push(address);
      if (distance) lines.push(distance);
      return lines.join("\n");
    }

    function cellHtml(value, sortValue = value) {
      const text = displayValue(value);
      return `<td data-sort-value="${escapeHtml(sortValue)}">${escapeHtml(text).replace(/\n/g, "<br>")}</td>`;
    }

    function showtimeGroupsFromCinemaOrari(cinemaOrari) {
      return Object.entries(cinemaOrari)
        .map(([cinema, showtimeInfo]) => ({
          cinema: cinemaLabelWithDetails(cinema, showtimeInfo),
          showtimes: combineShowtimes(showtimeInfo),
        }))
        .filter((group) => group.cinema || (group.showtimes && group.showtimes !== "N.D."));
    }

    function movieRow(movie) {
      const valutazioni = movie.valutazioni || {};
      const cinemaOrari = movie.cinema_orari && typeof movie.cinema_orari === "object" && !Array.isArray(movie.cinema_orari)
        ? movie.cinema_orari
        : {};
      const showtimeGroups = showtimeGroupsFromCinemaOrari(cinemaOrari);
      const cinemaNames = showtimeGroups.map((group) => group.cinema);
      const showtimes = showtimeGroups.map((group) => group.showtimes);
      const rating = ratingToNumber(valutazioni["MYMONETRO"]);
      const duration = Number(movie.durata_minuti);
      return `<tr data-showtime-groups="${escapeHtml(JSON.stringify(showtimeGroups))}">`
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
        + showtimeCellHtml(showtimeGroups, "cinema", cinemaNames.join(" "))
        + showtimeCellHtml(showtimeGroups, "showtimes", showtimes.join(" "))
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
      updateDistanceOriginInfo(payload);
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
      if (cityFilter) {
        cityFilter.value = cityLabels[staticSnapshot.city] || staticSnapshot.city;
      }
      setDistanceOriginInfo("");
      setStatus(message, kind);
    }

    function renderUnavailableRanking(city, cityLabel, message) {
      document.title = `Classifica film - ${cityLabel}`;
      titleElement.textContent = `Classifica film - ${cityLabel}`;
      subtitleElement.textContent = message;
      updatedElement.textContent = "Classifica non disponibile - 0 film";
      tbody.innerHTML = "";
      searchInput.value = "";
      resetSortState();
      updateFilter();
      activeCity = city;
      citySelect.value = city;
      if (cityFilter) {
        cityFilter.value = cityLabel;
      }
      setDistanceOriginInfo("");
      setStatus(`${message} (${cityLabel})`, "error");
    }

    async function loadCity(city) {
      const requestId = ++loadCityRequestId;
      const cityLabel = cityLabels[city] || city;
      pendingCity = city;
      citySelect.disabled = true;
      updateOriginButtons();
      setStatus(`Aggiornamento ${cityLabel}...`, "");
      try {
        const response = await fetch(rankingApiUrl(city), {
          headers: { Accept: "application/json" },
        });
        if (requestId !== loadCityRequestId) {
          return;
        }
        if (response.status === 429) {
          citySelect.value = activeCity;
          setStatus("Hai raggiunto il limite di aggiornamenti live. Riprova pi\u00f9 tardi.", "error");
          return;
        }
        if (response.status === 400) {
          try {
            const errorPayload = await response.json();
            if (requestId !== loadCityRequestId) {
              return;
            }
            const errorDetail = errorPayload.detail || errorPayload;
            const originMessage = geocodingOriginErrorMessage(errorDetail);
            if (originMessage) {
              setDistanceOriginInfo(originMessage, "warn");
              setStatus(originMessage, "warn");
              return;
            }
            if (errorDetail.error_code === "ranking_not_available") {
              const message = errorDetail.message || `Classifica non disponibile per ${cityLabel}.`;
              renderUnavailableRanking(city, cityLabel, message);
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
        if (requestId !== loadCityRequestId) {
          return;
        }
        renderApiRanking(payload);
      } catch (error) {
        if (requestId !== loadCityRequestId) {
          return;
        }
        restoreStaticFallback("API non raggiungibile. Mantengo i dati statici disponibili.", "warn");
      } finally {
        if (requestId === loadCityRequestId) {
          pendingCity = null;
          citySelect.disabled = false;
          updateOriginButtons();
        }
      }
    }

    // 7. Event listeners and initialization
    for (const button of sortButtons) {
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        sortBy(Number(button.dataset.column), button.dataset.sortType);
      });
    }

    searchInput.addEventListener("input", updateFilter);
    searchInput.addEventListener("search", updateFilter);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        updateFilter();
      }
    });

    showtimeStart?.addEventListener("change", updateFilter);
    showtimeEnd?.addEventListener("change", updateFilter);
    showtimeReset?.addEventListener("click", () => {
      if (showtimeStart) showtimeStart.value = "";
      if (showtimeEnd) showtimeEnd.value = "";
      updateFilter();
    });

    ensureDistanceControls();
    if (originInput) {
      originInput.value = storedUserOrigin;
      originInput.addEventListener("input", updateOriginButtons);
      originInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyUserOrigin();
        }
      });
    }
    originApplyButton?.addEventListener("click", applyUserOrigin);
    originRemoveButton?.addEventListener("click", removeUserOrigin);
    updateOriginButtons();

    if (typeof window.addEventListener === "function") {
      window.addEventListener("resize", syncVisibleShowtimeGroupHeights);
    }

    citySelect.addEventListener("change", () => {
      const selectedCity = citySelect.value || DEFAULT_CITY;
      if (selectedCity !== activeCity && selectedCity !== pendingCity) {
        loadCity(selectedCity);
      }
    });

    if (cityFilter) {
      cityFilter.addEventListener("focus", () => {
        openCityResults();
        renderCityResults(cityFilter.value);
      });
      cityFilter.addEventListener("input", (event) => {
        renderCityResults(event.target.value);
        if (!isCityListOpen) openCityResults();
      });
      cityFilter.addEventListener("keydown", (event) => {
        if (!isCityListOpen && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        if (event.key === "Enter") {
          event.preventDefault();
          if (highlightedCityIndex >= 0 && visibleCityOptions[highlightedCityIndex]) {
            selectCity(visibleCityOptions[highlightedCityIndex]);
          } else {
            selectBestFilteredCity();
          }
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!isCityListOpen) openCityResults();
          const resultItems = comboboxResultsContainer.querySelectorAll("[role='option'][data-city]");
          if (resultItems.length) {
            highlightCityResult((highlightedCityIndex + 1) % resultItems.length);
          }
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!isCityListOpen) openCityResults();
          const resultItems = comboboxResultsContainer.querySelectorAll("[role='option'][data-city]");
          if (resultItems.length) {
            highlightCityResult(highlightedCityIndex <= 0 ? resultItems.length - 1 : highlightedCityIndex - 1);
          }
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeCityResults();
        }
      });
    }

    document.addEventListener("click", (event) => {
      if (cityFilter && comboboxResultsContainer && !cityFilter.contains(event.target) && !comboboxResultsContainer.contains(event.target)) {
        closeCityResults();
      }
    });

    loadApiVersion();
    loadCityCatalog();
    if (storedUserOrigin) {
      loadCity(activeCity || DEFAULT_CITY);
    }
    updateFilter();
