/**
 * WS-5000 Weather Station Card for Home Assistant
 * Faithfully recreates the Ambient Weather WS-5000 display console
 */

class WS5000WeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._timeInterval = null;
  }

  static getStubConfig() {
    return {
      outdoor_temp: 'sensor.outdoor_temperature',
      outdoor_temp_high: 'sensor.outdoor_temperature_high',
      outdoor_temp_low: 'sensor.outdoor_temperature_low',
      outdoor_humidity: 'sensor.outdoor_humidity',
      feels_like: 'sensor.feels_like',
      dew_point: 'sensor.dew_point',
      wind_speed: 'sensor.wind_speed',
      wind_gust: 'sensor.wind_gust',
      wind_direction: 'sensor.wind_direction',
      wind_direction_degrees: 'sensor.wind_direction_degrees',
      wind_avg_10min: 'sensor.wind_avg_10min',
      wind_max_daily: 'sensor.wind_max_daily',
      indoor_temp: 'sensor.indoor_temperature',
      indoor_humidity: 'sensor.indoor_humidity',
      pressure_abs: 'sensor.barometric_pressure_abs',
      pressure_rel: 'sensor.barometric_pressure_rel',
      pressure_trend: 'sensor.pressure_trend',
      pressure_change: 'sensor.pressure_change',
      rain_rate: 'sensor.rain_rate',
      rain_event: 'sensor.rain_event',
      rain_hourly: 'sensor.rain_hourly',
      rain_daily: 'sensor.rain_daily',
      rain_weekly: 'sensor.rain_weekly',
      rain_monthly: 'sensor.rain_monthly',
      rain_yearly: 'sensor.rain_yearly',
      uv_index: 'sensor.uv_index',
      solar_radiation: 'sensor.solar_radiation',
      pm25_outdoor: 'sensor.pm25_outdoor',
      pm25_indoor: 'sensor.pm25_indoor',
      soil_moisture: 'sensor.soil_moisture',
      lightning_distance: 'sensor.lightning_distance',
      lightning_count: 'sensor.lightning_count',
      lightning_time: 'sensor.lightning_time',
    };
  }

  setConfig(config) { this._config = config; this.render(); }
  set hass(hass) { this._hass = hass; this.render(); }
  getCardSize() { return 10; }

  // Native card dimensions (width x height in px at 1:1 scale)
  static get CARD_W() { return 660; }
  static get CARD_H() { return 480; }

  connectedCallback() {
    this._setupScaling();
  }

  _setupScaling() {
    if (this._resizeObserver) return; // already set up
    this._resizeObserver = new ResizeObserver(() => this._applyScale());
    this._resizeObserver.observe(this);
    // Also handle screen rotation / browser resize
    this._winResizeHandler = () => this._applyScale();
    window.addEventListener('resize', this._winResizeHandler);
    this._applyScale();
  }

  _applyScale() {
    const cfg = this._config || {};
    if (!cfg.scale_to_fit) return;

    // Use viewport dimensions so we fill the full screen
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = vw / WS5000WeatherCard.CARD_W;
    const scaleY = vh / WS5000WeatherCard.CARD_H;
    const scale = Math.min(scaleX, scaleY); // letterbox — preserve aspect ratio

    const wrapper = this.shadowRoot && this.shadowRoot.querySelector('.ws-scale-wrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.width = WS5000WeatherCard.CARD_W + 'px';
      // Set host size so HA doesn't add scrollbars
      this.style.width  = vw + 'px';
      this.style.height = (WS5000WeatherCard.CARD_H * scale) + 'px';
      this.style.overflow = 'hidden';
      this.style.display = 'block';
    }
  }

  _s(entityId, decimals = 1, fallback = '--') {
    if (!entityId || !this._hass) return fallback;
    const st = this._hass.states[entityId];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return fallback;
    const v = parseFloat(st.state);
    if (!isNaN(v)) return v.toFixed(decimals);
    return st.state || fallback;
  }

  _unit(entityId, def = '') {
    if (!entityId || !this._hass) return def;
    return this._hass.states[entityId]?.attributes?.unit_of_measurement || def;
  }

  _windDirDeg() {
    const v = parseFloat(this._s(this._config.wind_direction_degrees, 0, 'NaN'));
    return isNaN(v) ? null : v;
  }

  _windDirLabel() {
    const raw = this._s(this._config.wind_direction, 0, null);
    if (raw && raw !== '--' && isNaN(parseFloat(raw))) return raw;
    const deg = this._windDirDeg();
    if (deg === null) return '--';
    const d = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return d[Math.round(deg / 22.5) % 16];
  }

  _tempColor(f) {
    const t = parseFloat(f);
    if (isNaN(t)) return { stop0: '#555', stop1: '#333', text: '#888' };
    if (t <= 32)  return { stop0: '#4fc3f7', stop1: '#0288d1', text: '#4fc3f7' };
    if (t <= 50)  return { stop0: '#4dd0e1', stop1: '#006064', text: '#4dd0e1' };
    if (t <= 65)  return { stop0: '#81c784', stop1: '#388e3c', text: '#81c784' };
    if (t <= 75)  return { stop0: '#fff176', stop1: '#f9a825', text: '#ffe57f' };
    if (t <= 85)  return { stop0: '#ffb74d', stop1: '#e65100', text: '#ffa726' };
    if (t <= 95)  return { stop0: '#ef9a9a', stop1: '#c62828', text: '#ef5350' };
    return { stop0: '#ce93d8', stop1: '#6a1b9a', text: '#ba68c8' };
  }

  _humColor(h) {
    const v = parseFloat(h);
    if (isNaN(v)) return { stop0: '#555', stop1: '#333', text: '#888' };
    if (v < 25)  return { stop0: '#81d4fa', stop1: '#0277bd', text: '#29b6f6' };
    if (v < 45)  return { stop0: '#a5d6a7', stop1: '#2e7d32', text: '#66bb6a' };
    if (v < 65)  return { stop0: '#b39ddb', stop1: '#4527a0', text: '#9575cd' };
    return { stop0: '#7c4dff', stop1: '#311b92', text: '#7c4dff' };
  }

  _pressureTrendArrow() {
    if (!this._config.pressure_trend || !this._hass) return '↘';
    const s = (this._hass.states[this._config.pressure_trend]?.state || '').toLowerCase();
    if (s.includes('rising') || s === 'up')    return '↗';
    if (s.includes('falling') || s === 'down') return '↘';
    return '→';
  }

  _moonPhase() {
    const now = new Date();
    const known = new Date('2000-01-06');
    const diff = (now - known) / 86400000;
    const phase = ((diff % 29.53) + 29.53) % 29.53;
    if (phase < 1.85)  return 'New Moon';
    if (phase < 7.38)  return 'Waxing Crescent';
    if (phase < 9.22)  return 'First Quarter';
    if (phase < 14.76) return 'Waxing Gibbous';
    if (phase < 16.61) return 'Full Moon';
    if (phase < 22.15) return 'Waning Gibbous';
    if (phase < 23.99) return 'Last Quarter';
    return 'Waning Crescent';
  }

  _moonEmoji() {
    const p = this._moonPhase();
    const m = { 'New Moon':'🌑','Waxing Crescent':'🌒','First Quarter':'🌓','Waxing Gibbous':'🌔','Full Moon':'🌕','Waning Gibbous':'🌖','Last Quarter':'🌗','Waning Crescent':'🌘' };
    return m[p] || '🌑';
  }

  // SVG arc path helper
  _arc(cx, cy, r, startDeg, endDeg) {
    const r2 = (d) => (d - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(r2(startDeg));
    const y1 = cy + r * Math.sin(r2(startDeg));
    const x2 = cx + r * Math.cos(r2(endDeg));
    const y2 = cy + r * Math.sin(r2(endDeg));
    return `M${x1},${y1} A${r},${r} 0 ${endDeg - startDeg > 180 ? 1 : 0},1 ${x2},${y2}`;
  }

  // Large outdoor temperature gauge (matches the big orange/red ring on the WS-5000)
  _makeTempGauge(temp, high, low) {
    const S = 140, C = 70, R = 55, TR = 58;
    const col = this._tempColor(temp);
    const tVal = parseFloat(temp);
    const pct = isNaN(tVal) ? 0 : Math.min(Math.max((tVal - 0) / 120, 0), 1);
    const startA = 148, totalA = 244;
    const endA = startA + pct * totalA;
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <defs>
        <linearGradient id="tg_g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${col.stop0}"/>
          <stop offset="100%" stop-color="${col.stop1}"/>
        </linearGradient>
        <filter id="tg_glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
          <feBlend in="SourceGraphic" in2="blur" mode="screen"/>
        </filter>
      </defs>
      <!-- Track -->
      <path d="${this._arc(C,C,R,startA,startA+totalA)}" fill="none" stroke="#0a1e1e" stroke-width="12" stroke-linecap="round"/>
      <!-- Color fill -->
      ${!isNaN(tVal) ? `<path d="${this._arc(C,C,R,startA,Math.min(endA,startA+totalA-1))}" fill="none" stroke="url(#tg_g)" stroke-width="12" stroke-linecap="round" filter="url(#tg_glow)"/>` : ''}
      <!-- Outer border ring -->
      <circle cx="${C}" cy="${C}" r="${TR+4}" fill="none" stroke="#0d2020" stroke-width="1.5"/>
      <circle cx="${C}" cy="${C}" r="${TR-13}" fill="none" stroke="#0d2020" stroke-width="1"/>
      <!-- High temp -->
      ${high !== '--' ? `
        <text x="${C-26}" y="${C-18}" fill="${col.stop0}" font-size="11" font-family="Arial" opacity="0.9">↑ ${high}°</text>
      ` : ''}
      <!-- Low temp -->
      ${low !== '--' ? `
        <text x="${C-26}" y="${C+26}" fill="${col.stop0}" font-size="11" font-family="Arial" opacity="0.9">↓ ${low}°</text>
      ` : ''}
      <!-- Main value -->
      <text x="${C}" y="${C+10}" text-anchor="middle" fill="${col.text}" font-size="30" font-weight="900" font-family="Arial">${temp}</text>
      <text x="${C+28}" y="${C-4}" fill="${col.stop0}" font-size="13" font-family="Arial" opacity="0.85">°</text>
    </svg>`;
  }

  // Wind compass matching WS-5000 dark teal circle with needle
  _makeWindGauge(speed, gust, dir, dirDeg, unit) {
    const S = 140, C = 70, R = 52;
    const deg = dirDeg !== null ? dirDeg : 0;
    const toRad = d => (d - 90) * Math.PI / 180;
    const nLen = R * 0.72, tLen = R * 0.28;
    const nx = C + nLen * Math.cos(toRad(deg));
    const ny = C + nLen * Math.sin(toRad(deg));
    const tx = C - tLen * Math.cos(toRad(deg));
    const ty = C - tLen * Math.sin(toRad(deg));
    // Arrowhead points
    const pw = 5;
    const perp = toRad(deg + 90);
    const ap1x = C + (nLen-10)*Math.cos(toRad(deg)) + pw*Math.cos(perp);
    const ap1y = C + (nLen-10)*Math.sin(toRad(deg)) + pw*Math.sin(perp);
    const ap2x = C + (nLen-10)*Math.cos(toRad(deg)) - pw*Math.cos(perp);
    const ap2y = C + (nLen-10)*Math.sin(toRad(deg)) - pw*Math.sin(perp);
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <defs>
        <radialGradient id="wg_bg" cx="50%" cy="50%">
          <stop offset="0%" stop-color="#0d2028"/>
          <stop offset="100%" stop-color="#050d10"/>
        </radialGradient>
      </defs>
      <!-- Outer ring -->
      <circle cx="${C}" cy="${C}" r="${C-2}" fill="#060f14" stroke="#1a3540" stroke-width="2"/>
      <!-- Inner face -->
      <circle cx="${C}" cy="${C}" r="${R+4}" fill="url(#wg_bg)" stroke="#0f2a35" stroke-width="1.5"/>
      <!-- Tick marks (8 positions) -->
      ${[0,45,90,135,180,225,270,315].map(a => {
        const major = a % 90 === 0;
        const r2 = (a - 90) * Math.PI / 180;
        const r1i = R+1, r2i = r1i - (major ? 8 : 5);
        return `<line x1="${C+r1i*Math.cos(r2)}" y1="${C+r1i*Math.sin(r2)}" x2="${C+r2i*Math.cos(r2)}" y2="${C+r2i*Math.sin(r2)}" stroke="${major?'#2a7080':'#0f3540'}" stroke-width="${major?1.5:1}"/>`;
      }).join('')}
      <!-- Cardinal labels -->
      <text x="${C}" y="${C-R+13}" text-anchor="middle" fill="#3ab8cc" font-size="11" font-weight="bold" font-family="Arial">N</text>
      <text x="${C}" y="${C+R-3}" text-anchor="middle" fill="#1a6070" font-size="9" font-family="Arial">S</text>
      <text x="${C+R-3}" y="${C+4}" text-anchor="middle" fill="#1a6070" font-size="9" font-family="Arial">E</text>
      <text x="${C-R+3}" y="${C+4}" text-anchor="middle" fill="#1a6070" font-size="9" font-family="Arial">W</text>
      <!-- Direction + degrees in top-left quadrant -->
      <text x="${C-22}" y="${C-22}" text-anchor="middle" fill="#5adaea" font-size="11" font-weight="bold" font-family="Arial">${dir}</text>
      <text x="${C+26}" y="${C-26}" text-anchor="end" fill="#3aaabb" font-size="10" font-family="Arial">${speed}°</text>
      ${dirDeg !== null ? `
      <!-- Needle tail (grey) -->
      <line x1="${C}" y1="${C}" x2="${tx}" y2="${ty}" stroke="#607080" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
      <!-- Needle head (teal) -->
      <line x1="${C}" y1="${C}" x2="${nx}" y2="${ny}" stroke="#3abccc" stroke-width="3" stroke-linecap="round"/>
      <!-- Arrowhead -->
      <polygon points="${nx},${ny} ${ap1x},${ap1y} ${ap2x},${ap2y}" fill="#3abccc"/>
      <!-- Center dot -->
      <circle cx="${C}" cy="${C}" r="4" fill="#3abccc" stroke="#0a2030" stroke-width="1.5"/>
      ` : ''}
      <!-- Speed big number (bottom center of circle) -->
      <text x="${C}" y="${C+18}" text-anchor="middle" fill="#d0f0ff" font-size="28" font-weight="900" font-family="Arial">${speed}</text>
      <text x="${C}" y="${C+30}" text-anchor="middle" fill="#3a8898" font-size="9" font-family="Arial">Gust ${gust}</text>
      <text x="${C}" y="${C+41}" text-anchor="middle" fill="#2a6070" font-size="9" font-family="Arial">${unit}</text>
    </svg>`;
  }

  // Small circular gauge for indoor temp or humidity
  _makeSmallGauge(id, value, isHumidity, size=90) {
    const C = size/2, R = size*0.36;
    const col = isHumidity ? this._humColor(value) : this._tempColor(value);
    const vf = parseFloat(value);
    const pct = isNaN(vf) ? 0 : isHumidity
      ? Math.min(Math.max(vf / 100, 0), 1)
      : Math.min(Math.max((vf - 0) / 120, 0), 1);
    const startA = 135, totalA = 270;
    const endA = startA + pct * totalA;
    const displayVal = isHumidity ? `${value}%` : value;
    const trackW = size * 0.11;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="${id}_g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${col.stop0}"/>
          <stop offset="100%" stop-color="${col.stop1}"/>
        </linearGradient>
      </defs>
      <!-- Track -->
      <path d="${this._arc(C,C,R,startA,startA+totalA)}" fill="none" stroke="#0a1818" stroke-width="${trackW}" stroke-linecap="round"/>
      <!-- Fill arc -->
      ${!isNaN(vf) ? `<path d="${this._arc(C,C,R,startA,Math.min(endA,startA+totalA-1))}" fill="none" stroke="url(#${id}_g)" stroke-width="${trackW}" stroke-linecap="round"/>` : ''}
      <!-- Value -->
      <text x="${C}" y="${C+size*0.07}" text-anchor="middle" fill="${col.stop0}" font-size="${size*0.2}" font-weight="bold" font-family="Arial">${displayVal}</text>
      ${isHumidity ? '' : `<text x="${C+R*0.7}" y="${C-R*0.5}" fill="${col.stop0}" font-size="${size*0.11}" font-family="Arial" opacity="0.8">°</text>`}
    </svg>`;
  }

  render() {
    if (!this._config) return;
    const cfg = this._config;

    const outTemp    = this._s(cfg.outdoor_temp, 1);
    const outHigh    = this._s(cfg.outdoor_temp_high, 1);
    const outLow     = this._s(cfg.outdoor_temp_low, 1);
    const outHum     = this._s(cfg.outdoor_humidity, 0);
    const feelsLike  = this._s(cfg.feels_like, 1);
    const dewPt      = this._s(cfg.dew_point, 1);
    const windSpd    = this._s(cfg.wind_speed, 1);
    const windGust   = this._s(cfg.wind_gust, 1);
    const windDir    = this._windDirLabel();
    const windDirDeg = this._windDirDeg();
    const wind10     = this._s(cfg.wind_avg_10min, 1);
    const windMax    = this._s(cfg.wind_max_daily, 1);
    const wind10Dir  = windDir;
    const inTemp     = this._s(cfg.indoor_temp, 1);
    const inHum      = this._s(cfg.indoor_humidity, 0);
    const pressAbs   = this._s(cfg.pressure_abs, 2);
    const pressChange= this._s(cfg.pressure_change, 2);
    const pressTrend = this._pressureTrendArrow();
    const rainRate   = this._s(cfg.rain_rate, 2);
    const rainEvent  = this._s(cfg.rain_event, 2);
    const rainHourly = this._s(cfg.rain_hourly, 2);
    const rainDaily  = this._s(cfg.rain_daily, 2);
    const rainWeekly = this._s(cfg.rain_weekly, 2);
    const rainMonthly= this._s(cfg.rain_monthly, 2);
    const rainYearly = this._s(cfg.rain_yearly, 2);
    const uvIdx      = this._s(cfg.uv_index, 0);
    const solar      = this._s(cfg.solar_radiation, 3);
    const pm25out    = this._s(cfg.pm25_outdoor, 0);
    const pm25in     = this._s(cfg.pm25_indoor, 0);
    const soilMoist  = this._s(cfg.soil_moisture, 0);
    const lightDist  = this._s(cfg.lightning_distance, 0);
    const lightCnt   = this._s(cfg.lightning_count, 0);
    const lightTime  = this._s(cfg.lightning_time, 0);
    const windUnit   = this._unit(cfg.wind_speed, 'mph');
    const rainUnit   = this._unit(cfg.rain_daily, 'in');
    const pressUnit  = this._unit(cfg.pressure_abs, 'inHg');

    const now    = new Date();
    const hrs    = now.getHours();
    const ampm   = hrs < 12 ? 'am' : 'pm';
    const timeStr= now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dateStr= now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});

    const rainDailyF = parseFloat(rainDaily);
    const drops = [0,1,2,3].map(i =>
      `<div class="drop ${!isNaN(rainDailyF) && rainDailyF > i*0.25 ? 'active':'inactive'}">
        <svg viewBox="0 0 12 16"><path d="M6 0 C6 0 0 8 0 11 A6 6 0 0 0 12 11 C12 8 6 0 6 0Z"/></svg>
      </div>`
    ).join('');

    const pressF = parseFloat(pressAbs);
    const wxIcon = pressF > 30.2 ? '☀️' : pressF > 29.8 ? '⛅' : pressF > 29.2 ? '☁️' : '⛈️';

    this.shadowRoot.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Orbitron:wght@400;700&display=swap');
      :host { display:block; font-family:'Roboto',sans-serif; }
      * { box-sizing:border-box; margin:0; padding:0; }

      /* Scale-to-fit wrapper — used when scale_to_fit: true */
      .ws-scale-wrapper {
        display: inline-block;
        transform-origin: top left;
      }

      .ws { background:#000; border:3px solid #0a1a1a; border-radius:6px; color:#ccc; overflow:hidden; user-select:none; min-width:600px; }

      /* TOP BAR */
      .top-bar {
        background:#040c0e;
        border-bottom:1px solid #0a2020;
        display:flex; align-items:center; gap:8px;
        padding:4px 8px;
        font-size:11px;
        flex-wrap:nowrap;
      }
      .wu-logo { color:#e87010; font-weight:900; font-size:15px; letter-spacing:-1px; flex:0 0 auto; }
      .top-icons { display:flex; gap:5px; color:#2a7a8a; align-items:center; flex:0 0 auto; }
      .drops { display:flex; gap:4px; align-items:center; flex:0 0 auto; }
      .drop { width:12px; height:16px; }
      .drop svg { width:100%; height:100%; }
      .drop.active svg path { fill:#2280e0; }
      .drop.inactive svg path { fill:#102030; }
      .soil-info { flex:1; text-align:center; color:#5adaea; font-size:11px; white-space:nowrap; }
      .datetime { text-align:right; flex:0 0 auto; }
      .date-line { font-size:12px; color:#c0d0d0; }
      .time-line { font-family:'Orbitron',monospace; font-size:15px; color:#e0f8ff; font-weight:700; }
      .lightning-box {
        background:#06121a; border:1px solid #0f2a3a; border-radius:3px;
        padding:3px 7px; font-size:10px; color:#5adaea; flex:0 0 auto; min-width:95px;
        line-height:1.6;
      }
      .bolt { color:#ffcc00; }

      /* GAUGE ROW */
      .gauge-row {
        display:grid;
        grid-template-columns:148px 148px 1fr;
        border-bottom:1px solid #0a2020;
      }
      .g-cell {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding:8px 4px 6px;
        border-right:1px solid #0a2020;
      }
      .g-cell:last-child { border-right:none; }
      .g-label { font-size:9px; color:#2a7070; letter-spacing:1.5px; text-transform:uppercase; margin-top:2px; }

      /* CH1 area (right side of gauge row) */
      .ch1-area {
        display:flex; flex-direction:column;
      }
      .ch1-header {
        font-size:10px; color:#2a7070; letter-spacing:1.5px; text-transform:uppercase;
        text-align:center; padding:5px 0 3px; border-bottom:1px solid #0a2020;
      }
      .ch1-gauges {
        display:grid; grid-template-columns:1fr 1fr; flex:1;
      }
      .ch1-gauge {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding:6px 4px; border-right:1px solid #0a2020; position:relative;
      }
      .ch1-gauge:last-child { border-right:none; }
      .ch1-label { font-size:9px; color:#2a7070; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
      .ch-badge { position:absolute; bottom:5px; right:5px; border:1px solid #1a4040; border-radius:2px; padding:0 4px; font-size:8px; color:#2a6070; }

      /* STATS BAR */
      .stats-bar {
        display:flex; align-items:center; gap:0;
        border-bottom:1px solid #0a2020;
        padding:5px 10px; gap:2px; flex-wrap:wrap;
        background:#030b0e;
      }
      .st { display:flex; flex-direction:column; align-items:flex-start; padding:0 10px 0 0; }
      .st-lbl { font-size:8px; color:#2a6070; letter-spacing:0.5px; text-transform:uppercase; }
      .st-val { font-size:14px; font-weight:700; color:#d0e8f0; }
      .st-u { font-size:9px; color:#3a7080; }
      .vdiv { width:1px; height:32px; background:#0a2020; margin:0 6px; flex:0 0 auto; }
      .pm-col { display:flex; flex-direction:column; gap:3px; font-size:10px; padding-right:8px; }
      .pm-dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:3px; vertical-align:middle; }
      .pm-o { background:#e8c820; }
      .pm-i { background:#80d040; }
      .moon-col { display:flex; flex-direction:column; align-items:center; font-size:9px; color:#6a8a7a; gap:1px; }
      .moon-e { font-size:22px; line-height:1; }

      /* BOTTOM: Rain + Pressure */
      .bottom-row {
        display:grid; grid-template-columns:1fr 1fr;
        border-bottom:1px solid #0a2020;
        min-height:130px;
      }
      .rain-panel { border-right:1px solid #0a2020; display:flex; flex-direction:column; }
      .rain-top { display:grid; grid-template-columns:105px 1fr; flex:1; }
      .rain-drop-col {
        border-right:1px solid #0a2020;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding:8px;
      }
      .rain-drop-em { font-size:42px; line-height:1; }
      .rain-sub { font-size:9px; color:#1a5070; letter-spacing:1px; text-transform:uppercase; margin-top:3px; }
      .rain-rate-sm { font-size:10px; color:#2a6080; margin-top:4px; text-align:center; }
      .rain-big-col { padding:10px 14px; display:flex; flex-direction:column; justify-content:center; }
      .rain-big-val { font-family:'Orbitron',monospace; font-size:38px; font-weight:700; color:#1a88f0; line-height:1; }
      .rain-big-unit { font-size:14px; color:#1a6090; margin-left:4px; }
      .rain-big-lbl { font-size:9px; color:#1a5070; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
      .rain-table-grid {
        display:grid; grid-template-columns:1fr 1fr; gap:1px 10px;
        border-top:1px solid #0a2020; padding:6px 12px;
        background:#030a0e;
      }
      .rtr { display:flex; justify-content:space-between; font-size:11px; }
      .rtr-lbl { color:#2a6070; }
      .rtr-val { color:#1a88f0; font-weight:700; }

      /* PRESSURE PANEL */
      .pressure-panel { padding:8px 14px; display:flex; flex-direction:column; gap:6px; background:#030b0a; }
      .press-hdr { font-size:10px; color:#2a6a5a; letter-spacing:1px; text-transform:uppercase; border-bottom:1px solid #0a2018; padding-bottom:4px; }
      .press-main { display:flex; align-items:center; gap:8px; }
      .press-abs-tag { font-size:11px; font-weight:700; color:#3a9a7a; }
      .press-val { font-family:'Orbitron',monospace; font-size:34px; font-weight:700; color:#c8e8d0; line-height:1; }
      .press-unit { font-size:13px; color:#3a7a5a; margin-left:3px; }
      .press-arrow { font-size:22px; color:#3abcaa; border:1px solid #1a5044; border-radius:50%; width:32px;height:32px; display:flex;align-items:center;justify-content:center; }
      .press-change { font-size:11px; color:#3a9a6a; padding-left:32px; }
      .press-wx { display:flex; align-items:center; justify-content:flex-end; gap:6px; margin-top:2px; }
      .wx-icon { font-size:30px; }

      /* UV/SOLAR ROW */
      .uv-solar-bar {
        display:flex; align-items:center; gap:12px;
        padding:5px 12px;
        background:#020809;
        border-top:1px solid #0a1818;
        flex-wrap:wrap;
      }
      .solar-val { font-size:17px; font-weight:700; color:#d8d040; }
      .solar-unit { font-size:9px; color:#6a6820; }
      .uv-val { font-size:19px; font-weight:900; color:#e0e0d0; }
      .uv-lbl { font-size:10px; color:#6a6a6a; }
      .vdiv2 { width:1px; height:22px; background:#0a1818; }
      .sun-times { margin-left:auto; display:flex; gap:14px; font-size:11px; color:#6a6040; }
      .sun-t { color:#b0a040; font-weight:700; }
    </style>

    <div class="ws-scale-wrapper">
    <div class="ws">

      <!-- TOP BAR -->
      <div class="top-bar">
        <span class="wu-logo">wu</span>
        <div class="top-icons">
          <span title="Cloud connected">☁</span>
          <span title="Signal strength">📶</span>
          <span title="Sensor">📡</span>
        </div>
        <div class="drops">${drops}</div>
        <div class="soil-info">${soilMoist !== '--' ? `🌱 CH4 Soil Moisture: ${soilMoist} %` : ''}</div>
        <div class="datetime">
          <div class="date-line">${dateStr}</div>
          <div class="time-line">${ampm} ${timeStr}</div>
        </div>
        <div class="lightning-box">
          ${lightDist !== '--'
            ? `<div><span class="bolt">⚡</span> ${lightTime !== '--' ? lightTime+' min ago' : 'Recent'}</div><div>Dis: ${lightDist} km</div><div>Cnt: ${lightCnt}</div>`
            : `<div style="color:#1a4050;font-size:10px;">No lightning<br>detected</div>`}
        </div>
      </div>

      <!-- GAUGE ROW -->
      <div class="gauge-row">
        <!-- Outdoor Temp Ring -->
        <div class="g-cell">
          ${this._makeTempGauge(outTemp, outHigh, outLow)}
        </div>
        <!-- Wind Compass -->
        <div class="g-cell">
          ${this._makeWindGauge(windSpd, windGust, windDir, windDirDeg, windUnit)}
        </div>
        <!-- CH1: Temp + Humidity -->
        <div class="ch1-area">
          <div class="ch1-header">T&amp;H CH1</div>
          <div class="ch1-gauges">
            <div class="ch1-gauge">
              ${this._makeSmallGauge('it', inTemp, false, 95)}
              <div class="ch1-label">Temperature</div>
            </div>
            <div class="ch1-gauge">
              ${this._makeSmallGauge('ih', inHum, true, 95)}
              <div class="ch1-label">Humidity</div>
              <div class="ch-badge">CH</div>
            </div>
          </div>
        </div>
      </div>

      <!-- STATS BAR -->
      <div class="stats-bar">
        <div class="st"><span class="st-lbl">Feels Like</span><span class="st-val">${feelsLike}<span class="st-u">°</span></span></div>
        <div class="vdiv"></div>
        <div class="st"><span class="st-lbl">Dewpoint</span><span class="st-val">${dewPt}<span class="st-u">°</span></span></div>
        <div class="vdiv"></div>
        <div class="st"><span class="st-lbl">Humidity</span><span class="st-val">${outHum}<span class="st-u">%</span></span></div>
        <div class="vdiv"></div>
        <div class="st"><span class="st-lbl">10Min.Avg</span><span class="st-val" style="font-size:12px;">${wind10Dir} ${wind10}</span></div>
        <div class="vdiv"></div>
        <div class="st"><span class="st-lbl">Max Daily Gust</span><span class="st-val">${windMax}</span></div>
        <div class="vdiv"></div>
        <div class="pm-col">
          <span><span class="pm-dot pm-o"></span><span style="color:#c0a820;">OUT: ${pm25out !== '--' ? pm25out+' ug/m³' : '--'}</span></span>
          <span><span class="pm-dot pm-i"></span><span style="color:#70b030;">IN: ${pm25in !== '--' ? pm25in+' ug/m³' : '--'}</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="moon-col">
          <span class="moon-e">${this._moonEmoji()}</span>
          <span>${this._moonPhase()}</span>
        </div>
      </div>

      <!-- BOTTOM: Rain + Pressure -->
      <div class="bottom-row">

        <!-- Rain -->
        <div class="rain-panel">
          <div class="rain-top">
            <div class="rain-drop-col">
              <div class="rain-drop-em">💧</div>
              <div class="rain-sub">Daily Rain</div>
              <div class="rain-rate-sm">Rate<br>${rainRate} ${rainUnit}/h</div>
            </div>
            <div class="rain-big-col">
              <div>
                <span class="rain-big-val">${rainDaily}</span>
                <span class="rain-big-unit">${rainUnit}</span>
              </div>
              <div class="rain-big-lbl">Daily Rain</div>
            </div>
          </div>
          <div class="rain-table-grid">
            <div class="rtr"><span class="rtr-lbl">Event</span><span class="rtr-val">${rainEvent} ${rainUnit}</span></div>
            <div class="rtr"><span class="rtr-lbl">Weekly</span><span class="rtr-val">${rainWeekly} ${rainUnit}</span></div>
            <div class="rtr"><span class="rtr-lbl">Hourly</span><span class="rtr-val">${rainHourly} ${rainUnit}</span></div>
            <div class="rtr"><span class="rtr-lbl">Monthly</span><span class="rtr-val">${rainMonthly} ${rainUnit}</span></div>
            <div class="rtr" style="grid-column:1/-1;"><span class="rtr-lbl">Yearly</span><span class="rtr-val">${rainYearly} ${rainUnit}</span></div>
          </div>
        </div>

        <!-- Pressure -->
        <div class="pressure-panel">
          <div class="press-hdr">Barometer Reading</div>
          <div class="press-main">
            <span class="press-abs-tag">ABS</span>
            <div>
              <span class="press-val">${pressAbs}</span>
              <span class="press-unit">${pressUnit}</span>
            </div>
            <div class="press-arrow">${pressTrend}</div>
          </div>
          <div class="press-change">${pressChange !== '--' ? pressChange + ' ' + pressUnit : ''}</div>
          <div class="press-wx">
            <span class="wx-icon">${wxIcon}</span>
          </div>
        </div>
      </div>

      <!-- UV / SOLAR BAR -->
      <div class="uv-solar-bar">
        <div>
          <span class="solar-val">${solar}</span>
          <span class="solar-unit"> w/m²</span>
        </div>
        <div class="vdiv2"></div>
        <div>
          <span class="uv-val">${uvIdx}</span>
          <span class="uv-lbl"> UV Index</span>
        </div>
        <div class="sun-times">
          <span>☀ am <span class="sun-t">5:35</span></span>
          <span>pm <span class="sun-t">7:09</span> ☀</span>
        </div>
      </div>

    </div>
    </div>
    `;

    if (this._timeInterval) clearInterval(this._timeInterval);
    this._timeInterval = setInterval(() => this.render(), 1000);

    // Re-apply scaling after every render since innerHTML was replaced
    this._setupScaling();
    requestAnimationFrame(() => this._applyScale());
  }

  disconnectedCallback() {
    if (this._timeInterval) clearInterval(this._timeInterval);
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._winResizeHandler) { window.removeEventListener('resize', this._winResizeHandler); }
  }
}

customElements.define('ws5000-weather-card', WS5000WeatherCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ws5000-weather-card',
  name: 'WS-5000 Weather Station Console',
  description: 'Faithfully recreates the Ambient Weather WS-5000 display console for Home Assistant.',
  preview: true,
});
