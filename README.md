# WS-5000 Weather Station Card

A Home Assistant Lovelace custom card that displays weather station data in the style of the **Ambient Weather WS-5000** display console.

![WS-5000 Console Card](preview.png)

## Features

- 🌡️ Outdoor temperature (large, color-coded by temperature range)
- 🌡️ Indoor temperature & humidity with comfort indicator
- 🌬️ Animated wind compass with speed & gust
- 🌡️ Barometric pressure with arc gauge & trend arrow
- 🌧️ Rainfall (rate / today / weekly / monthly / yearly)
- ☀️ UV Index with gradient bar & risk level
- ☀️ Solar radiation with level bar
- 🔋 Outdoor sensor battery indicator
- 📡 Signal strength display
- 🕐 Live clock & date
- Dark LCD-style console aesthetic matching the physical WS-5000

---

## Installation

### Via HACS (Recommended)

1. Open HACS in Home Assistant.
2. Go to **Frontend** → click the three-dot menu → **Custom Repositories**.
3. Add your GitHub repository URL and category: **Lovelace**.
4. Find **WS-5000 Weather Station Card** in HACS and install it.
5. Reload your browser.

### Manual Installation

1. Copy `ws5000-weather-card.js` to your `config/www/` folder.
2. In Home Assistant, go to **Settings → Dashboards → Resources**.
3. Add a new resource:
   - URL: `/local/ws5000-weather-card.js`
   - Type: **JavaScript Module**
4. Reload the browser.

---

## Card Configuration

Add the card to your Lovelace dashboard:

```yaml
type: custom:ws5000-weather-card

# --- Outdoor sensor ---
outdoor_temp: sensor.outdoor_temperature          # °F or °C
outdoor_humidity: sensor.outdoor_humidity         # %

# --- Indoor sensor ---
indoor_temp: sensor.indoor_temperature
indoor_humidity: sensor.indoor_humidity

# --- Derived outdoor values ---
feels_like: sensor.feels_like_temperature
dew_point: sensor.dew_point

# --- Wind ---
wind_speed: sensor.wind_speed                     # mph, km/h, m/s, etc.
wind_gust: sensor.wind_gust
wind_direction: sensor.wind_direction             # Cardinal string (N, SSW, etc.) OR degrees
wind_direction_degrees: sensor.wind_direction_degrees  # Numeric degrees 0-360

# --- Pressure ---
pressure: sensor.barometric_pressure              # inHg, hPa, or mbar
pressure_trend: sensor.pressure_trend            # rising / falling / steady (optional)

# --- Rainfall ---
rain_rate: sensor.rain_rate                       # in/hr or mm/hr
rain_today: sensor.rain_today
rain_weekly: sensor.rain_weekly
rain_monthly: sensor.rain_monthly
rain_yearly: sensor.rain_yearly

# --- UV & Solar ---
uv_index: sensor.uv_index
solar_radiation: sensor.solar_radiation           # W/m²

# --- Battery (optional) ---
battery_outdoor: sensor.outdoor_battery          # % or ok/low string
```

> **All entity IDs are examples.** Replace them with the actual entity IDs from your Home Assistant instance.

---

## Typical Entity Sources

### Ambient Weather Integration
If you use the [Ambient Weather Network integration](https://www.home-assistant.io/integrations/ambient_station/) your entities will look like:
```
sensor.my_station_temperature
sensor.my_station_feelslike
sensor.my_station_humidity
sensor.my_station_windspeedmph
sensor.my_station_windgustmph
sensor.my_station_winddir
sensor.my_station_baromrelin
sensor.my_station_hourlyrainin
sensor.my_station_dailyrainin
sensor.my_station_weeklyrainin
sensor.my_station_monthlyrainin
sensor.my_station_yearlyrainin
sensor.my_station_uv
sensor.my_station_solarradiation
sensor.my_station_tempinf
sensor.my_station_humidityin
sensor.my_station_batt1
```

### ecowitt / Fine Offset (via HACS Ecowitt integration)
Entities follow the same pattern; just map them accordingly.

---

## Customization Tips

- **Units are auto-detected** from the entity's `unit_of_measurement` attribute.
- The **temperature color** automatically shifts from cool blue → cyan → yellow → orange based on value.
- The **UV bar** uses the official EPA color scale (Green → Yellow → Orange → Red → Violet).
- The **barometer arc** spans 28–32 inHg (adjust in source if using hPa).
- The **pressure status** label (Fair / Partly Cloudy / Cloudy / Stormy) uses standard meteorological thresholds.

---

## Requirements

| Requirement | Version |
|---|---|
| Home Assistant | 2023.1+ |
| HACS | 1.0+ |
| Browser | Any modern browser with Custom Elements v1 support |

---

## License

MIT License — see [LICENSE](LICENSE) for details.
