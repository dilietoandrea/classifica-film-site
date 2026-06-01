// 1. Constants and DOM references
    const API_BASE_URL = String(
      window.CFR_SITE_CONFIG?.API_BASE_URL || window.API_BASE_URL || "http://127.0.0.1:8000"
    ).replace(/\/+$/, "");
    const DEFAULT_CITY = "roma";
    const USER_ORIGIN_STORAGE_KEY = "CFR_USER_ORIGIN";
    const ONLY_CINEMAS_WITH_DISTANCE_STORAGE_KEY = "CFR_ONLY_CINEMAS_WITH_DISTANCE";
    const ONLY_CINEMAS_WITHOUT_DISTANCE_STORAGE_KEY = "CFR_ONLY_CINEMAS_WITHOUT_DISTANCE";
    const SORT_CINEMAS_BY_DISTANCE_STORAGE_KEY = "CFR_SORT_CINEMAS_BY_DISTANCE";
    const ONLY_CINEMAS_WITH_ADDRESS_STORAGE_KEY = "CFR_ONLY_CINEMAS_WITH_ADDRESS";
    const ONLY_CINEMAS_WITHOUT_ADDRESS_STORAGE_KEY = "CFR_ONLY_CINEMAS_WITHOUT_ADDRESS";
    const SHOW_CINEMA_ADDRESSES_STORAGE_KEY = "CFR_SHOW_CINEMA_ADDRESSES";
    const INCLUDE_PROVINCE_STORAGE_KEY = "CFR_INCLUDE_PROVINCE";
    const ORIGIN_REQUEST_DEDUP_MS = 1200;
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
    let hasApiRankingData = false;
    let pendingCity = null;
    let visibleCityOptions = [];
    let highlightedCityIndex = -1;
    let isCityListOpen = false;
    let originInput = null;
    let originApplyButton = null;
    let originRemoveButton = null;
    let onlyDistanceCheckbox = null;
    let onlyWithoutDistanceCheckbox = null;
    let sortDistanceCheckbox = null;
    let onlyWithAddressCheckbox = null;
    let onlyWithoutAddressCheckbox = null;
    let showAddressCheckbox = null;
    let includeProvinceCheckbox = null;
    let distanceOriginInfo = null;
    let storedUserOrigin = readStoredUserOrigin(activeCity);
    let onlyCinemasWithDistance = readStoredBoolean(ONLY_CINEMAS_WITH_DISTANCE_STORAGE_KEY, activeCity);
    let onlyCinemasWithoutDistance = readStoredBoolean(ONLY_CINEMAS_WITHOUT_DISTANCE_STORAGE_KEY, activeCity);
    let sortCinemasByDistance = readStoredBoolean(SORT_CINEMAS_BY_DISTANCE_STORAGE_KEY, activeCity);
    let onlyCinemasWithAddress = readStoredBoolean(ONLY_CINEMAS_WITH_ADDRESS_STORAGE_KEY, activeCity);
    let onlyCinemasWithoutAddress = readStoredBoolean(ONLY_CINEMAS_WITHOUT_ADDRESS_STORAGE_KEY, activeCity);
    let showCinemaAddresses = readStoredBoolean(SHOW_CINEMA_ADDRESSES_STORAGE_KEY);
    let includeProvince = readStoredBoolean(INCLUDE_PROVINCE_STORAGE_KEY, activeCity);
    let lastOriginRequestKey = "";
    let lastOriginRequestAt = 0;

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

    function normalizeStorageCity(city) {
      const text = String(city || DEFAULT_CITY).trim().toLocaleLowerCase("it-IT");
      return text || DEFAULT_CITY;
    }

    function cityScopedStorageKey(key, city) {
      return `${key}:${normalizeStorageCity(city)}`;
    }

    function distanceStateCity(city = pendingCity || activeCity || citySelect?.value || DEFAULT_CITY) {
      return normalizeStorageCity(city);
    }

    function readStoredUserOrigin(city = distanceStateCity()) {
      try {
        return String(window.localStorage?.getItem(cityScopedStorageKey(USER_ORIGIN_STORAGE_KEY, city)) || "").trim();
      } catch (error) {
        return "";
      }
    }

    function readStoredBoolean(key, city = null) {
      try {
        const storageKey = city ? cityScopedStorageKey(key, city) : key;
        return window.localStorage?.getItem(storageKey) === "1";
      } catch (error) {
        return false;
      }
    }

    function writeStoredBoolean(key, value, city = null) {
      try {
        const storageKey = city ? cityScopedStorageKey(key, city) : key;
        window.localStorage?.setItem(storageKey, value ? "1" : "0");
      } catch (error) {
        // localStorage may be blocked; the toggle still works for the current page.
      }
    }

    function writeStoredUserOrigin(value, city = distanceStateCity()) {
      try {
        const text = String(value || "").trim();
        const storageKey = cityScopedStorageKey(USER_ORIGIN_STORAGE_KEY, city);
        if (text) {
          window.localStorage?.setItem(storageKey, text);
        } else {
          window.localStorage?.removeItem(storageKey);
        }
      } catch (error) {
        // localStorage may be blocked by the browser; distance calculation still works for the current page.
      }
    }

    function currentUserOrigin() {
      return String(storedUserOrigin || "").trim();
    }

    function enteredUserOrigin() {
      if (originInput) {
        return String(originInput.value || "").trim();
      }
      return currentUserOrigin();
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
      const hasEnteredOrigin = Boolean(enteredUserOrigin());
      const hasActiveOrigin = Boolean(currentUserOrigin());
      if (originApplyButton) {
        originApplyButton.disabled = !hasEnteredOrigin || pendingCity !== null;
      }
      if (originRemoveButton) {
        originRemoveButton.hidden = !hasActiveOrigin;
        originRemoveButton.disabled = pendingCity !== null;
      }
      if (onlyDistanceCheckbox) {
        onlyDistanceCheckbox.disabled = !hasActiveOrigin;
      }
      if (onlyWithoutDistanceCheckbox) {
        onlyWithoutDistanceCheckbox.disabled = !hasActiveOrigin;
      }
      if (sortDistanceCheckbox) {
        sortDistanceCheckbox.disabled = !hasActiveOrigin;
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
        .distance-toggle {
          min-height: 42px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
          white-space: nowrap;
        }
        .distance-toggle input { width: 16px; height: 16px; }
        .distance-toggle:has(input:disabled) { opacity: 0.55; }
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
        onlyDistanceCheckbox = document.getElementById("distance-only-with-distance");
        onlyWithoutDistanceCheckbox = document.getElementById("distance-only-without-distance");
        sortDistanceCheckbox = document.getElementById("distance-sort-by-distance");
        onlyWithAddressCheckbox = document.getElementById("address-only-with-address");
        onlyWithoutAddressCheckbox = document.getElementById("address-only-without-address");
        showAddressCheckbox = document.getElementById("distance-show-addresses");
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

      const onlyDistanceLabel = document.createElement("label");
      onlyDistanceLabel.className = "distance-toggle";
      onlyDistanceCheckbox = document.createElement("input");
      onlyDistanceCheckbox.id = "distance-only-with-distance";
      onlyDistanceCheckbox.type = "checkbox";
      onlyDistanceCheckbox.checked = onlyCinemasWithDistance;
      onlyDistanceLabel.append(onlyDistanceCheckbox, "Solo cinema con distanza");

      const onlyWithoutDistanceLabel = document.createElement("label");
      onlyWithoutDistanceLabel.className = "distance-toggle";
      onlyWithoutDistanceCheckbox = document.createElement("input");
      onlyWithoutDistanceCheckbox.id = "distance-only-without-distance";
      onlyWithoutDistanceCheckbox.type = "checkbox";
      onlyWithoutDistanceCheckbox.checked = onlyCinemasWithoutDistance;
      onlyWithoutDistanceLabel.append(onlyWithoutDistanceCheckbox, "Solo cinema senza distanza");

      const sortDistanceLabel = document.createElement("label");
      sortDistanceLabel.className = "distance-toggle";
      sortDistanceCheckbox = document.createElement("input");
      sortDistanceCheckbox.id = "distance-sort-by-distance";
      sortDistanceCheckbox.type = "checkbox";
      sortDistanceCheckbox.checked = sortCinemasByDistance;
      sortDistanceLabel.append(sortDistanceCheckbox, "Ordina cinema per distanza");

      const onlyWithAddressLabel = document.createElement("label");
      onlyWithAddressLabel.className = "distance-toggle";
      onlyWithAddressCheckbox = document.createElement("input");
      onlyWithAddressCheckbox.id = "address-only-with-address";
      onlyWithAddressCheckbox.type = "checkbox";
      onlyWithAddressCheckbox.checked = onlyCinemasWithAddress;
      onlyWithAddressLabel.append(onlyWithAddressCheckbox, "Solo cinema con indirizzo");

      const onlyWithoutAddressLabel = document.createElement("label");
      onlyWithoutAddressLabel.className = "distance-toggle";
      onlyWithoutAddressCheckbox = document.createElement("input");
      onlyWithoutAddressCheckbox.id = "address-only-without-address";
      onlyWithoutAddressCheckbox.type = "checkbox";
      onlyWithoutAddressCheckbox.checked = onlyCinemasWithoutAddress;
      onlyWithoutAddressLabel.append(onlyWithoutAddressCheckbox, "Solo cinema senza indirizzo");

      const showAddressLabel = document.createElement("label");
      showAddressLabel.className = "distance-toggle";
      showAddressCheckbox = document.createElement("input");
      showAddressCheckbox.id = "distance-show-addresses";
      showAddressCheckbox.type = "checkbox";
      showAddressCheckbox.checked = showCinemaAddresses;
      showAddressLabel.append(showAddressCheckbox, "Mostra indirizzi cinema");

      const includeProvinceLabel = document.createElement("label");
      includeProvinceLabel.className = "distance-toggle";
      includeProvinceCheckbox = document.createElement("input");
      includeProvinceCheckbox.id = "ranking-include-province";
      includeProvinceCheckbox.type = "checkbox";
      includeProvinceCheckbox.checked = includeProvince;
      includeProvinceLabel.append(includeProvinceCheckbox, "Includi cinema della provincia");
      enforceExclusiveDistanceState();
      syncDistanceControlValues();

      const insertBefore = searchInput && searchInput.parentNode === toolbarTools ? searchInput : null;
      for (const element of [
        label,
        originInput,
        originApplyButton,
        originRemoveButton,
        onlyDistanceLabel,
        onlyWithoutDistanceLabel,
        sortDistanceLabel,
        onlyWithAddressLabel,
        onlyWithoutAddressLabel,
        showAddressLabel,
        includeProvinceLabel,
      ]) {
        toolbarTools.insertBefore(element, insertBefore);
      }

      distanceOriginInfo = document.createElement("p");
      distanceOriginInfo.className = "distance-origin-info";
      distanceOriginInfo.id = "distance-origin-info";
      distanceOriginInfo.setAttribute("hidden", "hidden");
      statusElement.insertAdjacentElement?.("afterend", distanceOriginInfo);
    }

    function enforceExclusiveDistanceState(changedToggle = "") {
      if (changedToggle === "with" && onlyCinemasWithDistance) {
        onlyCinemasWithoutDistance = false;
      } else if (changedToggle === "without" && onlyCinemasWithoutDistance) {
        onlyCinemasWithDistance = false;
      } else if (onlyCinemasWithDistance && onlyCinemasWithoutDistance) {
        onlyCinemasWithoutDistance = false;
      }
    }

    function enforceExclusiveAddressState(changedToggle = "") {
      if (changedToggle === "address-with" && onlyCinemasWithAddress) {
        onlyCinemasWithoutAddress = false;
      } else if (changedToggle === "address-without" && onlyCinemasWithoutAddress) {
        onlyCinemasWithAddress = false;
      } else if (onlyCinemasWithAddress && onlyCinemasWithoutAddress) {
        onlyCinemasWithoutAddress = false;
      }
    }

    function syncDistanceControlValues() {
      if (originInput) {
        originInput.value = storedUserOrigin;
      }
      if (onlyDistanceCheckbox) {
        onlyDistanceCheckbox.checked = onlyCinemasWithDistance;
      }
      if (onlyWithoutDistanceCheckbox) {
        onlyWithoutDistanceCheckbox.checked = onlyCinemasWithoutDistance;
      }
      if (sortDistanceCheckbox) {
        sortDistanceCheckbox.checked = sortCinemasByDistance;
      }
      if (onlyWithAddressCheckbox) {
        onlyWithAddressCheckbox.checked = onlyCinemasWithAddress;
        onlyWithAddressCheckbox.disabled = false;
      }
      if (onlyWithoutAddressCheckbox) {
        onlyWithoutAddressCheckbox.checked = onlyCinemasWithoutAddress;
        onlyWithoutAddressCheckbox.disabled = false;
      }
      if (showAddressCheckbox) {
        showAddressCheckbox.checked = showCinemaAddresses;
      }
      if (includeProvinceCheckbox) {
        includeProvinceCheckbox.checked = includeProvince;
      }
      updateOriginButtons();
    }

    function loadDistanceStateForCity(city, { clearInfo = true } = {}) {
      const scopedCity = distanceStateCity(city);
      storedUserOrigin = readStoredUserOrigin(scopedCity);
      onlyCinemasWithDistance = readStoredBoolean(ONLY_CINEMAS_WITH_DISTANCE_STORAGE_KEY, scopedCity);
      onlyCinemasWithoutDistance = readStoredBoolean(ONLY_CINEMAS_WITHOUT_DISTANCE_STORAGE_KEY, scopedCity);
      sortCinemasByDistance = readStoredBoolean(SORT_CINEMAS_BY_DISTANCE_STORAGE_KEY, scopedCity);
      onlyCinemasWithAddress = readStoredBoolean(ONLY_CINEMAS_WITH_ADDRESS_STORAGE_KEY, scopedCity);
      onlyCinemasWithoutAddress = readStoredBoolean(ONLY_CINEMAS_WITHOUT_ADDRESS_STORAGE_KEY, scopedCity);
      includeProvince = readStoredBoolean(INCLUDE_PROVINCE_STORAGE_KEY, scopedCity);
      enforceExclusiveDistanceState();
      enforceExclusiveAddressState();
      syncDistanceControlValues();
      if (clearInfo) {
        setDistanceOriginInfo("");
      }
    }

    function persistUserOrigin(value, city = distanceStateCity()) {
      storedUserOrigin = String(value || "").trim();
      writeStoredUserOrigin(storedUserOrigin, city);
      updateOriginButtons();
      updateFilter();
    }

    function applyUserOrigin() {
      const origin = enteredUserOrigin();
      if (!origin) {
        removeUserOrigin();
        return;
      }
      if (pendingCity !== null) {
        return;
      }
      const city = distanceStateCity(citySelect.value || activeCity || DEFAULT_CITY);
      const requestKey = `${city}\n${origin}`;
      const now = Date.now();
      if (requestKey === lastOriginRequestKey && now - lastOriginRequestAt < ORIGIN_REQUEST_DEDUP_MS) {
        return;
      }
      lastOriginRequestKey = requestKey;
      lastOriginRequestAt = now;
      if (originInput) {
        originInput.value = origin;
      }
      persistUserOrigin(origin, city);
      loadCity(city);
    }

    function updateDistanceToggleState(changedToggle = "") {
      const city = distanceStateCity();
      onlyCinemasWithDistance = Boolean(onlyDistanceCheckbox?.checked);
      onlyCinemasWithoutDistance = Boolean(onlyWithoutDistanceCheckbox?.checked);
      sortCinemasByDistance = Boolean(sortDistanceCheckbox?.checked);
      onlyCinemasWithAddress = Boolean(onlyWithAddressCheckbox?.checked);
      onlyCinemasWithoutAddress = Boolean(onlyWithoutAddressCheckbox?.checked);
      showCinemaAddresses = Boolean(showAddressCheckbox?.checked);
      includeProvince = Boolean(includeProvinceCheckbox?.checked);
      enforceExclusiveDistanceState(changedToggle);
      enforceExclusiveAddressState(changedToggle);
      syncDistanceControlValues();
      writeStoredBoolean(ONLY_CINEMAS_WITH_DISTANCE_STORAGE_KEY, onlyCinemasWithDistance, city);
      writeStoredBoolean(ONLY_CINEMAS_WITHOUT_DISTANCE_STORAGE_KEY, onlyCinemasWithoutDistance, city);
      writeStoredBoolean(SORT_CINEMAS_BY_DISTANCE_STORAGE_KEY, sortCinemasByDistance, city);
      writeStoredBoolean(ONLY_CINEMAS_WITH_ADDRESS_STORAGE_KEY, onlyCinemasWithAddress, city);
      writeStoredBoolean(ONLY_CINEMAS_WITHOUT_ADDRESS_STORAGE_KEY, onlyCinemasWithoutAddress, city);
      writeStoredBoolean(SHOW_CINEMA_ADDRESSES_STORAGE_KEY, showCinemaAddresses);
      writeStoredBoolean(INCLUDE_PROVINCE_STORAGE_KEY, includeProvince, city);
      if (needsApiRankingDataForAddressOptions() && !hasApiRankingData) {
        loadCity(activeCity || DEFAULT_CITY);
      } else if (changedToggle === "scope") {
        loadCity(activeCity || DEFAULT_CITY);
      } else {
        updateFilter();
      }
    }

    function removeUserOrigin() {
      const city = distanceStateCity(activeCity || citySelect.value || DEFAULT_CITY);
      if (originInput) {
        originInput.value = "";
      }
      persistUserOrigin("", city);
      setDistanceOriginInfo("");
      loadCity(city);
    }

    function rankingApiUrl(
      city,
      origin = normalizeStorageCity(city) === distanceStateCity() ? currentUserOrigin() : readStoredUserOrigin(city)
    ) {
      const params = [`city=${encodeURIComponent(city || DEFAULT_CITY)}`];
      const originText = String(origin || "").trim();
      if (originText) {
        params.push(`origin=${encodeURIComponent(originText)}`);
      }
      if (readStoredBoolean(INCLUDE_PROVINCE_STORAGE_KEY, city)) {
        params.push("scope=province");
      }
      if (needsApiRankingDataForAddressOptions()) {
        params.push("address_mode=auto");
      }
      return `${API_BASE_URL}/api/ranking?${params.join("&")}`;
    }

    function geocodingOriginErrorMessage(errorDetail) {
      const code = String(errorDetail?.error_code || errorDetail?.code || "").toLowerCase();
      const field = String(errorDetail?.field || "").toLowerCase();
      const message = String(errorDetail?.message || errorDetail?.detail || "").toLowerCase();
      if (field === "origin" || code.includes("origin") || message.includes("origin")) {
        return "Indirizzo di partenza non trovato.";
      }
      return "";
    }

    function updateDistanceOriginInfo(payload, city = activeCity) {
      const payloadCity = normalizeStorageCity(payload?.city || city);
      if (payloadCity !== normalizeStorageCity(city)) {
        setDistanceOriginInfo("");
        return;
      }
      const origin = currentUserOrigin();
      if (!origin) {
        setDistanceOriginInfo("");
        return;
      }
      const metadata = payload?.metadata || {};
      const status = String(
        metadata.distance_origin_geocoding_status ||
          (metadata.distance_origin_geocoded === false ? "not_found" : "ok")
      );
      if (status === "rate_limited") {
        const message = "Geocoding temporaneamente non disponibile. Riprova tra qualche minuto.";
        setDistanceOriginInfo(message, "warn");
        setStatus(message, "warn");
        return;
      }
      if (status === "not_found") {
        const message = "Indirizzo di partenza non trovato.";
        setDistanceOriginInfo(message, "warn");
        setStatus(message, "warn");
        return;
      }
      if (status === "timeout" || status === "request_failed") {
        const message = "Geocoding temporaneamente non disponibile. Riprova tra qualche minuto.";
        setDistanceOriginInfo(message, "warn");
        setStatus(message, "warn");
        return;
      }
      if (status === "out_of_bounds") {
        const message = "Indirizzo di partenza fuori dall'area supportata.";
        setDistanceOriginInfo(message, "warn");
        setStatus(message, "warn");
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

    function distanceKmValue(value) {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    }

    function groupDistanceKm(group) {
      return distanceKmValue(group?.cinemaDistanceKm ?? group?.distanceKm);
    }

    function groupHasDistance(group) {
      return groupDistanceKm(group) !== null;
    }

    function groupHasNoDistance(group) {
      return !groupHasDistance(group);
    }

    function groupHasAddress(group) {
      const address = String(group?.cinemaAddress ?? group?.address ?? "").trim();
      return Boolean(address && address.toUpperCase() !== "N.D.");
    }

    function groupHasNoAddress(group) {
      return !groupHasAddress(group);
    }

    function distanceOptionsActive() {
      return Boolean(currentUserOrigin());
    }

    function currentCinemaGroupOptions() {
      const active = distanceOptionsActive();
      return {
        onlyWithDistance: active && onlyCinemasWithDistance,
        onlyWithoutDistance: active && onlyCinemasWithoutDistance,
        sortByDistance: active && sortCinemasByDistance,
        showAddresses: showCinemaAddresses,
        onlyWithAddress: onlyCinemasWithAddress,
        onlyWithoutAddress: onlyCinemasWithoutAddress,
      };
    }

    function currentDistanceOptions() {
      return currentCinemaGroupOptions();
    }

    function needsApiRankingDataForAddressOptions() {
      return showCinemaAddresses || onlyCinemasWithAddress || onlyCinemasWithoutAddress;
    }

    function applyCinemaGroupOptions(groups) {
      const options = currentCinemaGroupOptions();
      let nextGroups = [...groups];
      if (options.onlyWithDistance) {
        nextGroups = nextGroups.filter(groupHasDistance);
      }
      if (options.onlyWithoutDistance) {
        nextGroups = nextGroups.filter(groupHasNoDistance);
      }
      if (options.onlyWithAddress) {
        nextGroups = nextGroups.filter(groupHasAddress);
      }
      if (options.onlyWithoutAddress) {
        nextGroups = nextGroups.filter(groupHasNoAddress);
      }
      if (options.sortByDistance) {
        nextGroups = nextGroups
          .map((group, index) => ({ group, index, distanceKm: groupDistanceKm(group) }))
          .sort((left, right) => {
            const leftHasDistance = left.distanceKm !== null;
            const rightHasDistance = right.distanceKm !== null;
            if (leftHasDistance && rightHasDistance && left.distanceKm !== right.distanceKm) {
              return left.distanceKm - right.distanceKm;
            }
            if (leftHasDistance !== rightHasDistance) {
              return leftHasDistance ? -1 : 1;
            }
            return left.index - right.index;
          })
          .map((item) => item.group);
      }
      return nextGroups;
    }

    function applyDistanceGroupOptions(groups) {
      return applyCinemaGroupOptions(groups);
    }

    function parseShowtimeGroups(row) {
      try {
        const groups = JSON.parse(row.dataset.showtimeGroups || "[]");
        if (!Array.isArray(groups)) {
          return [];
        }
        return groups
          .map((group) => ({
            cinemaName: String(group?.cinemaName || group?.cinema || "").trim(),
            cinemaAddress: String(group?.cinemaAddress || group?.address || "").trim(),
            cinemaDistance: String(group?.cinemaDistance || group?.distanceLabel || "").trim(),
            cinemaDistanceKm: groupDistanceKm(group),
            isAggregate: Boolean(group?.isAggregate ?? group?.is_aggregate),
            addressResolutionStatus: String(group?.addressResolutionStatus || group?.address_resolution_status || "").trim(),
            showtimes: String(group?.showtimes || "").trim(),
          }))
          .filter((group) => group.cinemaName || group.showtimes);
      } catch (error) {
        return [];
      }
    }

    function cinemaDisplayText(group) {
      const lines = [optionalText(group?.cinemaName ?? group?.cinema)].filter(Boolean);
      if (showCinemaAddresses) {
        const address = optionalText(group?.cinemaAddress ?? group?.address);
        if (address) {
          lines.push(address);
        } else if (group?.isAggregate || group?.addressResolutionStatus === "aggregate_area") {
          lines.push("Area aggregata MYmovies, cinema non specificato");
        }
      }
      const distance = optionalText(group?.cinemaDistance ?? group?.distanceLabel);
      if (distance) {
        lines.push(distance);
      }
      return lines.join("\n");
    }

    function showtimeGroupText(group, field) {
      if (field === "cinema") {
        return cinemaDisplayText(group) || "N.D.";
      }
      return group[field] || "N.D.";
    }

    function showtimeGroupsHtml(groups, field) {
      if (!groups.length) {
        return "N.D.";
      }
      return '<div class="showtime-groups">'
        + groups.map((group, index) => (
          `<div class="showtime-group" data-showtime-index="${index}">${escapeHtml(showtimeGroupText(group, field)).replace(/\n/g, "<br>")}</div>`
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
      const groups = applyCinemaGroupOptions(parseShowtimeGroups(row));
      const groupOptions = currentCinemaGroupOptions();
      if (!range.active) {
        renderShowtimeGroups(row, groups);
        return !(
          groupOptions.onlyWithDistance ||
          groupOptions.onlyWithoutDistance ||
          groupOptions.onlyWithAddress ||
          groupOptions.onlyWithoutAddress
        ) || groups.length > 0;
      }
      const filteredGroups = filteredShowtimeGroups(groups, range);
      renderShowtimeGroups(row, filteredGroups);
      return filteredGroups.length > 0;
    }

    function filteredShowtimeGroups(groups, range) {
      return groups
        .map((group) => ({
          cinemaName: group.cinemaName,
          cinemaAddress: group.cinemaAddress,
          cinemaDistance: group.cinemaDistance,
          cinemaDistanceKm: group.cinemaDistanceKm,
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

    function cinemaGroupFromShowtimeInfo(cinema, showtimeInfo) {
      return {
        cinemaName: optionalText(cinema),
        cinemaAddress: optionalText(showtimeInfo?.indirizzo),
        cinemaDistance: optionalText(showtimeInfo?.distance_label),
        cinemaDistanceKm: distanceKmValue(showtimeInfo?.distance_km),
        isAggregate: Boolean(showtimeInfo?.is_aggregate),
        addressResolutionStatus: optionalText(showtimeInfo?.address_resolution_status),
        showtimes: combineShowtimes(showtimeInfo),
      };
    }

    function cinemaLabelWithDetails(cinema, showtimeInfo) {
      return cinemaDisplayText(cinemaGroupFromShowtimeInfo(cinema, showtimeInfo));
    }

    function cellHtml(value, sortValue = value) {
      const text = displayValue(value);
      return `<td data-sort-value="${escapeHtml(sortValue)}">${escapeHtml(text).replace(/\n/g, "<br>")}</td>`;
    }

    function showtimeGroupsFromCinemaOrari(cinemaOrari) {
      return Object.entries(cinemaOrari)
        .map(([cinema, showtimeInfo]) => cinemaGroupFromShowtimeInfo(cinema, showtimeInfo))
        .filter((group) => group.cinemaName || (group.showtimes && group.showtimes !== "N.D."));
    }

    function movieRow(movie) {
      const valutazioni = movie.valutazioni || {};
      const cinemaOrari = movie.cinema_orari && typeof movie.cinema_orari === "object" && !Array.isArray(movie.cinema_orari)
        ? movie.cinema_orari
        : {};
      const showtimeGroups = showtimeGroupsFromCinemaOrari(cinemaOrari);
      const cinemaNames = showtimeGroups.map((group) => cinemaDisplayText(group));
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

    function hasOnlyAggregateCinemaGroups(movies) {
      let hasAnyGroup = false;
      for (const movie of movies) {
        const cinemaOrari = movie?.cinema_orari;
        if (!cinemaOrari || typeof cinemaOrari !== "object" || Array.isArray(cinemaOrari)) {
          continue;
        }
        for (const showtimeInfo of Object.values(cinemaOrari)) {
          if (!showtimeInfo || typeof showtimeInfo !== "object") {
            continue;
          }
          hasAnyGroup = true;
          const isAggregate = Boolean(showtimeInfo.is_aggregate)
            || String(showtimeInfo.address_resolution_status || "").trim() === "aggregate_area";
          if (!isAggregate) {
            return false;
          }
        }
      }
      return hasAnyGroup;
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
      const scope = String(payload.metadata?.scope || "city");
      hasApiRankingData = true;
      document.title = `Classifica film - ${cityLabel}`;
      titleElement.textContent = `Classifica film - ${cityLabel}`;
      subtitleElement.textContent = payload.subtitle || `Guida alla programmazione dei film in uscita nelle sale cinematografiche di ${cityLabel}.`;
      updatedElement.textContent = `Aggiornata il ${formatUpdatedAt(payload.updated_at)} - ${movies.length} film`;
      tbody.innerHTML = sortedMovies(movies).map(movieRow).join("");
      searchInput.value = "";
      activeCity = city;
      citySelect.value = city;
      syncDistanceControlValues();
      resetSortState();
      updateFilter();
      const scopeLabel = scope === "province" ? "provincia" : "città";
      let statusMessage = `source: ${source} | Ambito: ${scopeLabel}`;
      const cinemaCount = Number(payload?.metadata?.cinema_count);
      if (scope === "city" && cinemaCount === 0 && hasOnlyAggregateCinemaGroups(movies)) {
        statusMessage += " | Per questa località sono disponibili solo risultati aggregati. Prova a includere i cinema della provincia.";
      }
      setStatus(statusMessage, "ok");
      updateDistanceOriginInfo(payload, city);
    }

    function restoreStaticFallback(message, kind = "warn") {
      hasApiRankingData = false;
      document.title = staticSnapshot.title;
      titleElement.textContent = staticSnapshot.title;
      subtitleElement.textContent = staticSnapshot.subtitle;
      updatedElement.textContent = staticSnapshot.updated;
      tbody.innerHTML = staticSnapshot.rowsHtml;
      searchInput.value = "";
      activeCity = staticSnapshot.city;
      citySelect.value = staticSnapshot.city;
      if (cityFilter) {
        cityFilter.value = cityLabels[staticSnapshot.city] || staticSnapshot.city;
      }
      loadDistanceStateForCity(staticSnapshot.city, { clearInfo: true });
      resetSortState();
      updateFilter();
      setDistanceOriginInfo("");
      setStatus(message, kind);
    }

    function renderUnavailableRanking(city, cityLabel, message) {
      hasApiRankingData = true;
      document.title = `Classifica film - ${cityLabel}`;
      titleElement.textContent = `Classifica film - ${cityLabel}`;
      subtitleElement.textContent = message;
      updatedElement.textContent = "Classifica non disponibile - 0 film";
      tbody.innerHTML = "";
      searchInput.value = "";
      activeCity = city;
      citySelect.value = city;
      if (cityFilter) {
        cityFilter.value = cityLabel;
      }
      loadDistanceStateForCity(city, { clearInfo: true });
      resetSortState();
      updateFilter();
      setDistanceOriginInfo("");
      setStatus(`${message} (${cityLabel})`, "error");
    }

    async function loadCity(city) {
      const requestId = ++loadCityRequestId;
      const cityLabel = cityLabels[city] || city;
      pendingCity = city;
      loadDistanceStateForCity(city, { clearInfo: true });
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
          loadDistanceStateForCity(activeCity, { clearInfo: true });
          updateFilter();
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
              citySelect.value = activeCity;
              loadDistanceStateForCity(activeCity, { clearInfo: true });
              updateFilter();
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
    onlyDistanceCheckbox?.addEventListener("change", () => updateDistanceToggleState("with"));
    onlyWithoutDistanceCheckbox?.addEventListener("change", () => updateDistanceToggleState("without"));
    sortDistanceCheckbox?.addEventListener("change", () => updateDistanceToggleState());
    onlyWithAddressCheckbox?.addEventListener("change", () => updateDistanceToggleState("address-with"));
    onlyWithoutAddressCheckbox?.addEventListener("change", () => updateDistanceToggleState("address-without"));
    showAddressCheckbox?.addEventListener("change", () => updateDistanceToggleState());
    includeProvinceCheckbox?.addEventListener("change", () => updateDistanceToggleState("scope"));
    syncDistanceControlValues();

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
    if (storedUserOrigin || needsApiRankingDataForAddressOptions()) {
      loadCity(activeCity || DEFAULT_CITY);
    } else {
      updateFilter();
    }

/*
 * CFR_LIVE_UI_CLEANUP_PATCH
 * Defensive cleanup for live-rendered pages:
 * - hides stale static empty state when live movies are present;
 * - avoids duplicated origin-not-found messages;
 * - normalizes known city display names such as L'Aquila.
 */
(() => {
  const ORIGIN_NOT_FOUND_TEXT = "Indirizzo di partenza non trovato.";
  const EMPTY_STATE_TEXT = "Non sono presenti film in programmazione.";

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function safeSetTimeout(callback, delay = 0) {
    const timer =
      window && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : typeof setTimeout === "function"
          ? setTimeout
          : null;

    if (timer) {
      return timer(callback, delay);
    }

    callback();
    return null;
  }

  function hasPositiveMovieCount() {
    const bodyText = normalizeText(document.body ? document.body.textContent : "");
    if (/\b[1-9]\d*\s+di\s+[1-9]\d*\s+film\b/i.test(bodyText)) {
      return true;
    }
    if (/-\s*[1-9]\d*\s+film\b/i.test(bodyText)) {
      return true;
    }
    return Array.from(document.querySelectorAll("tbody tr")).some((row) => {
      return normalizeText(row.textContent);
    });
  }

  function fixCityDisplayName() {
    document.querySelectorAll("h1").forEach((heading) => {
      const current = heading.textContent || "";
      const fixed = current.replace(/Classifica film\s*-\s*Laquila\b/i, "Classifica film - L'Aquila");
      if (fixed !== current) {
        heading.textContent = fixed;
      }
    });

    if (document.title) {
      document.title = document.title.replace(/Classifica film\s*-\s*Laquila\b/i, "Classifica film - L'Aquila");
    }
  }

  function hideStaleEmptyState() {
    if (!hasPositiveMovieCount()) {
      return;
    }

    document.querySelectorAll("p, div, span").forEach((element) => {
      if (normalizeText(element.textContent) === EMPTY_STATE_TEXT) {
        element.hidden = true;
        element.style.display = "none";
        element.dataset.cfrHiddenEmptyState = "true";
      }
    });
  }

  function dedupeOriginNotFoundMessages() {
    const messages = Array.from(document.querySelectorAll("p, div, span")).filter((element) => {
      return normalizeText(element.textContent) === ORIGIN_NOT_FOUND_TEXT;
    });

    messages.forEach((element, index) => {
      if (index === 0) {
        if (element.dataset.cfrHiddenDuplicateOriginStatus === "true") {
          element.hidden = false;
          element.style.display = "";
          delete element.dataset.cfrHiddenDuplicateOriginStatus;
        }
        return;
      }

      element.hidden = true;
      element.style.display = "none";
      element.dataset.cfrHiddenDuplicateOriginStatus = "true";
    });
  }

  function cleanupLiveUiState() {
    if (!document.body) {
      return;
    }
    fixCityDisplayName();
    hideStaleEmptyState();
    dedupeOriginNotFoundMessages();
  }

  let scheduled = false;

  function scheduleCleanup() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    safeSetTimeout(() => {
      scheduled = false;
      cleanupLiveUiState();
    }, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCleanup);
  } else {
    scheduleCleanup();
  }

  safeSetTimeout(scheduleCleanup, 250);
  safeSetTimeout(scheduleCleanup, 1000);
  safeSetTimeout(scheduleCleanup, 2500);

  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(scheduleCleanup);
    const observeWhenReady = () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    };

    if (document.body) {
      observeWhenReady();
    } else {
      document.addEventListener("DOMContentLoaded", observeWhenReady, { once: true });
    }
  }
})();
