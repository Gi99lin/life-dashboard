/**
 * WeatherForecast.js — Current weather + Hourly forecast
 */

export async function initWeather() {
  const widget = document.getElementById('weatherWidget');
  if (!widget) return;

  try {
    const res = await fetch('/api/forecast');
    if (!res.ok) return;

    const { days, hourly, current } = await res.json();
    if (!days?.length || !hourly?.length || !current) return;

    const today = days[0];

    // Populate current basic
    const iconEl = document.getElementById('weatherIcon');
    const tempEl = document.getElementById('weatherTemp');
    const descEl = document.getElementById('weatherDesc');

    if (iconEl) iconEl.textContent = today.icon || '';
    if (tempEl) tempEl.textContent = `${Math.round(current.temp)}°`;
    if (descEl) descEl.textContent = today.desc || '';

    // Populate advanced metrics
    const humEl = document.getElementById('weatherHum');
    const windEl = document.getElementById('weatherWind');
    const feelsEl = document.getElementById('weatherFeels');
    const pressEl = document.getElementById('weatherPressure');
    const sunriseEl = document.getElementById('weatherSunrise');
    const sunsetEl = document.getElementById('weatherSunset');

    if (humEl) humEl.textContent = `${Math.round(current.humidity)}%`;
    if (windEl) windEl.textContent = `${current.wind} км/ч`;
    if (feelsEl) feelsEl.textContent = `${Math.round(current.feels_like)}°`;
    if (pressEl) pressEl.textContent = `${Math.round(current.pressure)} гПа`;

    // Populate quote
    const QUOTES = [
        "Опять деплой в пятницу?",
        "Работает — не трогай.",
        "Логгирование — для тех, кто не умеет пользоваться дебаггером.",
        "Проблема не в коде, проблема в прокладке между стулом и клавиатурой.",
        "99% багов исправляются очисткой кэша.",
        "Не баг, а фича.",
        "Сон для слабаков, кофе для сеньоров.",
        "Если скрипт работает без ошибок — значит, он ничего не делает.",
        "Докеренье — свет, а не докеренье — тьма.",
        "Утро начинается не с кофе, а с проверки логов."
    ];
    const quoteEl = document.getElementById('weatherQuote');
    if (quoteEl) {
        quoteEl.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
    }

    // format ISO sunrise to HH:mm
    if (sunriseEl && today.sunrise) sunriseEl.textContent = today.sunrise.slice(11, 16);
    if (sunsetEl && today.sunset) sunsetEl.textContent = today.sunset.slice(11, 16);

    // Render hourly
    const hourlyEl = document.getElementById('weatherHourly');
    if (hourlyEl) {
      renderHourly(hourlyEl, hourly);
    }

  } catch (err) {
    console.warn('Weather unavailable:', err);
  }
}

function renderHourly(container, hourlyData) {
  // Find current hour index
  const now = new Date();
  const currentIsoHour = now.toISOString().slice(0, 13) + ':00'; // "YYYY-MM-DDTHH:00"

  let startIndex = hourlyData.findIndex(h => h.time === currentIsoHour);
  if (startIndex === -1) startIndex = 0;

  // Take the next 8 hours
  const displayHours = hourlyData.slice(startIndex, startIndex + 8);

  container.innerHTML = displayHours.map(h => {
    // extract HH:MM
    const timeLabel = new Date(h.time + 'Z').toISOString().slice(11, 16); 
    // Open-Meteo returns time in local timezone string like "2026-04-19T14:00"
    // So let's parse it without Z
    const localTimeLabel = h.time.slice(11, 16);

    return `
      <div class="hourly-item">
        <span class="hc-time">${localTimeLabel}</span>
        <span class="hc-icon">${h.icon}</span>
        <span class="hc-temp">${Math.round(h.temp)}°</span>
      </div>
    `;
  }).join('');
}
