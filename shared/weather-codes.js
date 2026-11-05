// WMO weather codes (as returned by Open-Meteo) -> short label + icon name.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.WeatherCodes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function describe(code, isDay = true) {
    const c = Number(code);
    if (c === 0) return { text: 'Clear', icon: isDay ? 'sun' : 'moon' };
    if (c === 1 || c === 2) return { text: 'Partly cloudy', icon: isDay ? 'cloud-sun' : 'cloud' };
    if (c === 3) return { text: 'Cloudy', icon: 'cloud' };
    if (c === 45 || c === 48) return { text: 'Fog', icon: 'cloud-fog' };
    if (c >= 51 && c <= 57) return { text: 'Drizzle', icon: 'cloud-drizzle' };
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return { text: c >= 80 ? 'Showers' : 'Rain', icon: 'cloud-rain' };
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return { text: 'Snow', icon: 'cloud-snow' };
    if (c >= 95 && c <= 99) return { text: 'Storm', icon: 'cloud-lightning' };
    return { text: 'Unknown', icon: 'cloud' };
  }
  return { describe };
});
