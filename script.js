const API_KEY = '41c0fbaf1284cb185abce5765967f79b';

const BASE = 'https://api.openweathermap.org';
const FAV_KEY = 'weather-favorites';
const $ = id => document.getElementById(id);
const cityInput = $('cityInput'), weatherCard = $('weatherCard'), errorMsg = $('errorMsg');
const suggestionsEl = $('suggestions'), searchBtn = $('searchBtn');

let currentCity = null;   // last successfully loaded city name
let requestId = 0;        // ignore stale responses

const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- API ---------- */
async function fetchJSON(url) {
    const res = await fetch(url);
    if (res.status === 404) throw new Error('City not found. Check the spelling and try again.');
    if (res.status === 401) throw new Error('Invalid API key. Add your OpenWeatherMap key to API_KEY (new keys can take a couple of hours to activate).');
    if (res.status === 429) throw new Error('Too many requests. Wait a minute and try again.');
    if (!res.ok) throw new Error(`Weather service error (${res.status}). Try again shortly.`);
    return res.json();
}

// 1. Current weather
async function getWeather(city) {
    const data = await fetchJSON(`${BASE}/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    return {
        city: data.name,
        country: data.sys && data.sys.country,
        temp: Math.round(data.main.temp),
        feelsLike: Math.round(data.main.feels_like),
        description: data.weather[0].description,
        icon: data.weather[0].icon,
        humidity: data.main.humidity,
        windSpeed: data.wind.speed
    };
}

// 5-day forecast: the API returns 3-hour steps; pick one entry per day (closest to midday)
async function getForecast(city) {
    const data = await fetchJSON(`${BASE}/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`);
    const days = {};
    data.list.forEach(item => {
        const date = item.dt_txt.slice(0, 10);
        const hourDiff = Math.abs(parseInt(item.dt_txt.slice(11, 13), 10) - 12);
        const d = days[date] || (days[date] = { min: Infinity, max: -Infinity, best: item, diff: 99 });
        d.min = Math.min(d.min, item.main.temp_min);
        d.max = Math.max(d.max, item.main.temp_max);
        if (hourDiff < d.diff) { d.diff = hourDiff; d.best = item; }
    });
    const today = new Date().toISOString().slice(0, 10);
    return Object.keys(days).sort().filter(k => k !== today).slice(0, 5).map(k => ({
        date: new Date(k + 'T12:00:00'),
        min: Math.round(days[k].min), max: Math.round(days[k].max),
        description: days[k].best.weather[0].description, icon: days[k].best.weather[0].icon
    }));
}

/* ---------- Favorites (localStorage) ---------- */
function readFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}
function writeFavorites(list) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) { console.warn('Could not save favorites', e); }
}

// 2. Add favorite (no duplicates, case-insensitive)
async function addFavorite(city) {
    if (!city) return;
    const list = readFavorites();
    if (!list.some(c => c.toLowerCase() === city.toLowerCase())) {
        list.push(city);
        writeFavorites(list);
    }
    loadFavorites();
    renderFavButton();
}

function removeFavorite(city) {
    writeFavorites(readFavorites().filter(c => c !== city));
    loadFavorites();
    renderFavButton();
}

// 3. Display favorites
function loadFavorites() {
    const list = readFavorites();
    const el = $('favoritesList');
    if (!list.length) { el.innerHTML = '<p class="empty">No favorites yet. Search for a city and save it here.</p>'; return; }
    el.innerHTML = list.map(c => `
      <span class="chip">
        <button class="open" data-city="${escapeHTML(c)}">${escapeHTML(c)}</button>
        <button class="rm" data-city="${escapeHTML(c)}" aria-label="Remove ${escapeHTML(c)} from favorites">✕</button>
      </span>`).join('');
}

function renderFavButton() {
    const btn = $('favBtn');
    if (!btn || !currentCity) return;
    const isFav = readFavorites().some(c => c.toLowerCase() === currentCity.toLowerCase());
    btn.textContent = isFav ? '★ In favorites' : '☆ Add to favorites';
    btn.disabled = isFav;
}

/* ---------- Rendering ---------- */
const icon = code => `https://openweathermap.org/img/wn/${code}@2x.png`;

function showLoading() {
    errorMsg.style.display = 'none';
    weatherCard.style.display = 'block';
    weatherCard.innerHTML = `
      <div class="loading"><div class="spinner" role="status" aria-label="Loading weather"></div><p>Loading weather…</p></div>
      <div class="forecast" style="margin-top:20px">${'<div class="skel"></div>'.repeat(5)}</div>`;
}

function showError(msg) {
    weatherCard.style.display = 'none';
    errorMsg.textContent = msg;
    errorMsg.style.display = 'block';
}

function renderWeather(w, forecast) {
    weatherCard.innerHTML = `
      <div class="now">
        <div>
          <h2>${escapeHTML(w.city)}${w.country ? ', ' + escapeHTML(w.country) : ''}</h2>
          <p class="desc">${escapeHTML(w.description)}</p>
        </div>
        <img src="${icon(w.icon)}" alt="${escapeHTML(w.description)}">
        <div class="temp">${w.temp}°C</div>
      </div>
      <div class="stats">
        <div class="stat"><span>Feels like</span><b>${w.feelsLike}°C</b></div>
        <div class="stat"><span>Humidity</span><b>${w.humidity}%</b></div>
        <div class="stat"><span>Wind</span><b>${w.windSpeed} m/s</b></div>
      </div>
      <button id="favBtn" class="fav-btn"></button>
      <div class="forecast">
        ${forecast.map(f => `
          <div class="day">
            <div class="d">${f.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
            <img src="${icon(f.icon)}" alt="">
            <div><b>${f.max}°</b> <span class="t">${f.min}°</span></div>
            <div class="ds">${escapeHTML(f.description)}</div>
          </div>`).join('')}
      </div>`;
    $('favBtn').addEventListener('click', () => addFavorite(currentCity));
    renderFavButton();
}

/* ---------- Search ---------- */
// 4. Search flow: loading -> fetch (in parallel) -> render or error
async function searchWeather(city) {
    city = (city || cityInput.value).trim();
    if (!city) { showError('Enter a city name to search.'); return; }
    if (API_KEY === 'YOUR_API_KEY_HERE') { showError('Add your OpenWeatherMap API key to the API_KEY constant in this file.'); return; }

    const myId = ++requestId;
    hideSuggestions();
    showLoading();
    searchBtn.disabled = true;
    try {
        const [weather, forecast] = await Promise.all([getWeather(city), getForecast(city)]);
        if (myId !== requestId) return;
        currentCity = weather.city;
        renderWeather(weather, forecast);
    } catch (err) {
        if (myId !== requestId) return;
        console.error(err);
        showError(err instanceof TypeError ? 'Network error. Check your connection and try again.' : err.message);
    } finally {
        if (myId === requestId) searchBtn.disabled = false;
    }
}

// 5. Debounce helper (500ms)
function debounce(fn, delay = 500) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}
const debounceSearch = debounce(() => {
    if (cityInput.value.trim().length >= 3) searchWeather();
}, 500);

/* ---------- Suggestions (geocoding API) ---------- */
let activeIdx = -1;
function hideSuggestions() { suggestionsEl.style.display = 'none'; suggestionsEl.innerHTML = ''; activeIdx = -1; }

const fetchSuggestions = debounce(async () => {
    const q = cityInput.value.trim();
    if (q.length < 2 || API_KEY === 'YOUR_API_KEY_HERE') { hideSuggestions(); return; }
    try {
        const list = await fetchJSON(`${BASE}/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=5&appid=${API_KEY}`);
        if (q !== cityInput.value.trim()) return;
        if (!list.length) { hideSuggestions(); return; }
        suggestionsEl.innerHTML = list.map(p => {
            const label = [p.name, p.state, p.country].filter(Boolean).join(', ');
            return `<li role="option" data-city="${escapeHTML(p.name)}">${escapeHTML(label)}</li>`;
        }).join('');
        suggestionsEl.style.display = 'block';
        activeIdx = -1;
    } catch { hideSuggestions(); }
}, 300);

/* ---------- Theme ---------- */
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $('themeBtn').textContent = theme === 'dark' ? '☀️ Light' : '🌙 Dark';
    try { localStorage.setItem('weather-theme', theme); } catch { }
}

/* ---------- Wiring ---------- */
document.addEventListener('DOMContentLoaded', function () {
    let saved = null;
    try { saved = localStorage.getItem('weather-theme'); } catch { }
    applyTheme(saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    $('themeBtn').addEventListener('click', () =>
        applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

    searchBtn.addEventListener('click', () => searchWeather());

    cityInput.addEventListener('input', () => { debounceSearch(); fetchSuggestions(); });
    cityInput.addEventListener('keydown', e => {
        const items = [...suggestionsEl.children];
        if (e.key === 'ArrowDown' && items.length) {
            e.preventDefault(); activeIdx = (activeIdx + 1) % items.length;
        } else if (e.key === 'ArrowUp' && items.length) {
            e.preventDefault(); activeIdx = (activeIdx - 1 + items.length) % items.length;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0 && items[activeIdx]) cityInput.value = items[activeIdx].dataset.city;
            searchWeather();
            return;
        } else if (e.key === 'Escape') { hideSuggestions(); return; }
        else return;
        items.forEach((li, i) => li.classList.toggle('active', i === activeIdx));
    });

    suggestionsEl.addEventListener('click', e => {
        const li = e.target.closest('li');
        if (li) { cityInput.value = li.dataset.city; searchWeather(); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) hideSuggestions(); });

    $('favoritesList').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const city = btn.dataset.city;
        if (btn.classList.contains('rm')) removeFavorite(city);
        else { cityInput.value = city; searchWeather(city); }
    });

    loadFavorites();
    // Auto-load: open the first favorite on refresh
    const favs = readFavorites();
    if (favs.length) { cityInput.value = favs[0]; searchWeather(favs[0]); }
});

window.searchWeather = searchWeather;
window.addFavorite = addFavorite;