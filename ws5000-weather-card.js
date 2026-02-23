/**
 * Weather Station Card for Home Assistant
 * Styled after the Ambient Weather WS-5000 display console
 */

class WS5000WeatherCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._timeInterval = null;
    this._historyInterval = null; // periodic HA history refresh
    this._resizeObserver = null;
    this._winResizeHandler = null;
    this._history = {};         // { entityId: [{t, v}, ...] }
    this._graphEntity = null;   // currently displayed entity id
    this._graphLabel  = null;
    this._graphUnit   = null;
    this._graphTimeout = null;  // auto-close timer handle
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
    };
  }

  setConfig(config) {
    this._config = config;
    this.render();
    // Start fetching history from HA — first call is immediate
    this._scheduleHistoryRefresh();
  }

  set hass(hass) {
    this._hass = hass;
    this._recordHistory();
    this.render();
  }

  getCardSize() { return 10; }

  // ── History via HA history API ────────────────────────────────────────────

  _recordHistory() {
    // No-op: history is now loaded from HA via _fetchHistory()
    // We still add the current value as the latest data point so
    // the graph stays current between API refreshes.
    if (!this._hass || !this._config) return;
    const cfg = this._config;
    const now = Date.now();
    const eids = [
      cfg.outdoor_temp, cfg.outdoor_humidity, cfg.feels_like, cfg.dew_point,
      cfg.wind_speed, cfg.wind_gust, cfg.indoor_temp, cfg.indoor_humidity,
      cfg.pressure_abs, cfg.rain_rate, cfg.rain_daily,
      cfg.uv_index, cfg.solar_radiation,
      cfg.rain_event, cfg.rain_hourly, cfg.rain_weekly, cfg.rain_monthly, cfg.rain_yearly,
      cfg.wind_avg_10min, cfg.wind_max_daily,
    ].filter(Boolean);

    for (const eid of eids) {
      const st = this._hass.states[eid];
      if (!st) continue;
      const v = parseFloat(st.state);
      if (isNaN(v)) continue;
      if (!this._history[eid]) this._history[eid] = [];
      const arr = this._history[eid];
      // Append current value if different from last point (avoid duplicates)
      if (arr.length === 0 || now - arr[arr.length - 1].t >= 30000) {
        arr.push({ t: now, v });
      }
    }
  }

  // Fetch 12h of history from HA for all tracked entities in one API call.
  // Called once on setConfig and then every 5 minutes to keep data fresh.
  async _fetchHistory() {
    if (!this._hass || !this._config) return;
    const cfg = this._config;

    const eids = [
      cfg.outdoor_temp, cfg.outdoor_humidity, cfg.feels_like, cfg.dew_point,
      cfg.wind_speed, cfg.wind_gust, cfg.indoor_temp, cfg.indoor_humidity,
      cfg.pressure_abs, cfg.rain_rate, cfg.rain_daily,
      cfg.uv_index, cfg.solar_radiation,
      cfg.rain_event, cfg.rain_hourly, cfg.rain_weekly, cfg.rain_monthly, cfg.rain_yearly,
      cfg.wind_avg_10min, cfg.wind_max_daily,
    ].filter(Boolean);

    if (eids.length === 0) return;

    const now = new Date();
    const start = new Date(now.getTime() - 12 * 3600 * 1000);
    // ISO 8601 format required by HA history API
    const startStr = start.toISOString();
    const endStr   = now.toISOString();
    const entityList = eids.join(',');

    try {
      // callApi(method, path, parameters) — path is relative to /api/
      const results = await this._hass.callApi(
        'GET',
        `history/period/${startStr}?filter_entity_id=${entityList}&end_time=${endStr}&minimal_response=true&no_attributes=true`
      );

      // results is an array of arrays: one inner array per entity
      // Each item: { entity_id, state, last_changed }
      if (!Array.isArray(results)) return;

      for (const entityHistory of results) {
        if (!Array.isArray(entityHistory) || entityHistory.length === 0) continue;
        const eid = entityHistory[0].entity_id;
        if (!eid) continue;

        // Convert to our {t, v} format, dropping non-numeric states
        const points = [];
        for (const item of entityHistory) {
          const v = parseFloat(item.state);
          if (isNaN(v)) continue;
          const t = new Date(item.last_changed).getTime();
          if (!isNaN(t)) points.push({ t, v });
        }

        if (points.length > 0) {
          // Sort by time (should already be sorted but be safe)
          points.sort((a, b) => a.t - b.t);
          this._history[eid] = points;
        }
      }
    } catch (err) {
      // API call failed (e.g. no permission, recorder disabled) — fall back
      // silently to the locally-accumulated data already in this._history
      console.warn('WeatherStationCard: history API error', err);
    }
  }

  // Schedule periodic history refreshes (every 5 minutes)
  _scheduleHistoryRefresh() {
    if (this._historyInterval) return; // already scheduled
    // Initial fetch immediately
    this._fetchHistory();
    // Then every 5 minutes
    this._historyInterval = setInterval(() => this._fetchHistory(), 5 * 60 * 1000);
  }

  // ── Scaling ───────────────────────────────────────────────────────────────

  static get CARD_W() { return 660; }
  static get CARD_H() { return 490; }

  connectedCallback() { this._setupScaling(); }

  _setupScaling() {
    if (this._resizeObserver) return;
    this._resizeObserver = new ResizeObserver(() => this._applyScale());
    this._resizeObserver.observe(this);
    this._winResizeHandler = () => this._applyScale();
    window.addEventListener('resize', this._winResizeHandler);
    this._applyScale();
  }

  _applyScale() {
    if (!this._config || !this._config.scale_to_fit) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / WS5000WeatherCard.CARD_W, vh / WS5000WeatherCard.CARD_H);
    const offsetX = Math.max(0, (vw - WS5000WeatherCard.CARD_W * scale) / 2);
    const offsetY = Math.max(0, (vh - WS5000WeatherCard.CARD_H * scale) / 2);
    const wrapper = this.shadowRoot && this.shadowRoot.querySelector('.ws-scale-wrapper');
    if (wrapper) {
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
      wrapper.style.width = WS5000WeatherCard.CARD_W + 'px';
    }
    this.style.position = 'fixed';
    this.style.top = '0'; this.style.left = '0';
    this.style.width = vw + 'px'; this.style.height = vh + 'px';
    this.style.overflow = 'hidden'; this.style.display = 'block';
    this.style.background = '#000'; this.style.zIndex = '1';
  }

  disconnectedCallback() {
    if (this._timeInterval)   clearInterval(this._timeInterval);
    if (this._historyInterval) clearInterval(this._historyInterval);
    if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
    if (this._winResizeHandler) window.removeEventListener('resize', this._winResizeHandler);
    if (this._graphTimeout) clearTimeout(this._graphTimeout);
  }

  // ── Value helpers ─────────────────────────────────────────────────────────

  _s(eid, dec = 1, fb = '--') {
    if (!eid || !this._hass) return fb;
    const st = this._hass.states[eid];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return fb;
    const v = parseFloat(st.state);
    return isNaN(v) ? (st.state || fb) : v.toFixed(dec);
  }

  _unit(eid, def = '') {
    return this._hass?.states[eid]?.attributes?.unit_of_measurement || def;
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
    return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16];
  }

  _tempColor(f) {
    const t = parseFloat(f);
    if (isNaN(t)) return { stop0:'#555', stop1:'#333', text:'#888' };
    if (t <= 32)  return { stop0:'#4fc3f7', stop1:'#0288d1', text:'#4fc3f7' };
    if (t <= 50)  return { stop0:'#4dd0e1', stop1:'#006064', text:'#4dd0e1' };
    if (t <= 65)  return { stop0:'#81c784', stop1:'#388e3c', text:'#81c784' };
    if (t <= 75)  return { stop0:'#fff176', stop1:'#f9a825', text:'#ffe57f' };
    if (t <= 85)  return { stop0:'#ffb74d', stop1:'#e65100', text:'#ffa726' };
    if (t <= 95)  return { stop0:'#ef9a9a', stop1:'#c62828', text:'#ef5350' };
    return { stop0:'#ce93d8', stop1:'#6a1b9a', text:'#ba68c8' };
  }

  _humColor(h) {
    const v = parseFloat(h);
    if (isNaN(v)) return { stop0:'#555', stop1:'#333' };
    if (v < 25) return { stop0:'#81d4fa', stop1:'#0277bd' };
    if (v < 45) return { stop0:'#a5d6a7', stop1:'#2e7d32' };
    if (v < 65) return { stop0:'#b39ddb', stop1:'#4527a0' };
    return { stop0:'#7c4dff', stop1:'#311b92' };
  }

  _pressureTrendArrow() {
    const s = (this._hass?.states[this._config.pressure_trend]?.state || '').toLowerCase();
    if (s.includes('rising') || s === 'up') return '↗';
    if (s.includes('falling') || s === 'down') return '↘';
    return '→';
  }

  _moonPhase() {
    const diff = (new Date() - new Date('2000-01-06')) / 86400000;
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
    return {'New Moon':'🌑','Waxing Crescent':'🌒','First Quarter':'🌓','Waxing Gibbous':'🌔','Full Moon':'🌕','Waning Gibbous':'🌖','Last Quarter':'🌗','Waning Crescent':'🌘'}[this._moonPhase()] || '🌑';
  }

  _arc(cx, cy, r, sD, eD) {
    const rad = d => (d - 90) * Math.PI / 180;
    const x1 = cx + r*Math.cos(rad(sD)), y1 = cy + r*Math.sin(rad(sD));
    const x2 = cx + r*Math.cos(rad(eD)), y2 = cy + r*Math.sin(rad(eD));
    return `M${x1},${y1} A${r},${r} 0 ${eD-sD>180?1:0},1 ${x2},${y2}`;
  }

  // ── Mini sparkline (above dials) ──────────────────────────────────────────

  _makeMiniGraph(eid, color, W, H) {
    const data = this._history[eid] || [];
    const pL = 26, pR = 4, pT = 3, pB = 11;
    const gW = W - pL - pR, gH = H - pT - pB;

    if (data.length < 2) {
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><text x="${W/2}" y="${H/2+4}" text-anchor="middle" fill="#1a4040" font-size="8" font-family="Arial">—</text></svg>`;
    }

    const now = Date.now(), WINDOW = 12 * 3600 * 1000, startT = now - WINDOW;
    const vals = data.map(d => d.v);
    let minV = Math.min(...vals), maxV = Math.max(...vals);
    if (maxV - minV < 0.5) { minV -= 0.5; maxV += 0.5; }
    const range = maxV - minV;
    const toX = t => pL + ((t - startT) / WINDOW) * gW;
    const toY = v => pT + gH - ((v - minV) / range) * gH;

    const pts = data.map(d => `${toX(d.t).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');

    // Hour ticks on x-axis (no labels)
    const ticks = Array.from({length:11}, (_,i) => i+1).map(h => {
      const tx = toX(now - (12-h)*3600000).toFixed(1);
      const ty = (pT + gH).toFixed(1);
      return `<line x1="${tx}" y1="${ty}" x2="${tx}" y2="${(pT+gH+3).toFixed(1)}" stroke="#1a3838" stroke-width="1"/>`;
    }).join('');

    // Y labels: min and max only (compact)
    const fmt = v => Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
    const yLabels = `
      <text x="${pL-2}" y="${(toY(maxV)+3).toFixed(1)}" text-anchor="end" fill="#2a6060" font-size="7" font-family="Arial">${fmt(maxV)}</text>
      <text x="${pL-2}" y="${(toY(minV)+1).toFixed(1)}" text-anchor="end" fill="#2a6060" font-size="7" font-family="Arial">${fmt(minV)}</text>`;

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+gH}" stroke="#0d2828" stroke-width="0.5"/>
      <line x1="${pL}" y1="${pT+gH}" x2="${pL+gW}" y2="${pT+gH}" stroke="#0d2828" stroke-width="0.5"/>
      ${ticks}
      <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${yLabels}
    </svg>`;
  }

  // ── Full overlay graph ────────────────────────────────────────────────────

  _makeLargeGraph(eid, label, unit) {
    const data = this._history[eid] || [];
    const W = 620, H = 320;
    const pL = 44, pR = 16, pT = 24, pB = 32;
    const gW = W - pL - pR, gH = H - pT - pB;
    const now = Date.now(), WINDOW = 12*3600*1000, startT = now - WINDOW;

    if (data.length < 2) {
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#050d10" rx="6"/>
        <text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#3a7070" font-size="14" font-family="Arial">Not enough history yet — check back soon</text></svg>`;
    }

    const vals = data.map(d => d.v);
    let minV = Math.min(...vals), maxV = Math.max(...vals);
    if (maxV - minV < 0.5) { minV -= 0.5; maxV += 0.5; }
    const range = maxV - minV;
    const toX = t => pL + ((t - startT) / WINDOW) * gW;
    const toY = v => pT + gH - ((v - minV) / range) * gH;

    // Y grid + labels (5 lines)
    const yLines = Array.from({length:5}, (_,i) => {
      const v = minV + (i / 4) * range;
      const y = toY(v).toFixed(1);
      return `<line x1="${pL}" y1="${y}" x2="${pL+gW}" y2="${y}" stroke="#0d2828" stroke-width="0.5"/>
              <text x="${pL-5}" y="${(parseFloat(y)+4).toFixed(1)}" text-anchor="end" fill="#4a8888" font-size="10" font-family="Arial">${v.toFixed(1)}</text>`;
    }).join('');

    // X ticks every hour, labels every 2h
    const xLines = Array.from({length:13}, (_,h) => {
      const tx = toX(startT + h*3600000).toFixed(1);
      const major = h % 2 === 0;
      const tickH = major ? 7 : 4;
      const baseY = pT + gH;
      const lbl = h === 0 ? '-12h' : h === 12 ? 'now' : major ? `-${12-h}h` : '';
      return `<line x1="${tx}" y1="${baseY}" x2="${tx}" y2="${baseY+tickH}" stroke="${major?'#2a6060':'#1a3838'}" stroke-width="1"/>
              ${lbl ? `<text x="${tx}" y="${baseY+18}" text-anchor="middle" fill="#4a7070" font-size="9" font-family="Arial">${lbl}</text>` : ''}`;
    }).join('');

    // Area fill
    const firstX = toX(data[0].t).toFixed(1), lastX = toX(data[data.length-1].t).toFixed(1);
    const baseY = (pT + gH).toFixed(1);
    const area = `M${firstX},${baseY} ` + data.map(d => `L${toX(d.t).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ') + ` L${lastX},${baseY} Z`;
    const pts  = data.map(d => `${toX(d.t).toFixed(1)},${toY(d.v).toFixed(1)}`).join(' ');
    const titleStr = label + (unit ? ` (${unit})` : '') + ' — Last 12 Hours';

    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2adaea" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#2adaea" stop-opacity="0.01"/>
        </linearGradient>
        <clipPath id="gc"><rect x="${pL}" y="${pT}" width="${gW}" height="${gH}"/></clipPath>
      </defs>
      <rect width="${W}" height="${H}" fill="#050d10" rx="6"/>
      ${yLines}
      <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+gH}" stroke="#1a4040" stroke-width="1"/>
      <line x1="${pL}" y1="${pT+gH}" x2="${pL+gW}" y2="${pT+gH}" stroke="#1a4040" stroke-width="1"/>
      ${xLines}
      <path d="${area}" fill="url(#ga)" clip-path="url(#gc)"/>
      <polyline points="${pts}" fill="none" stroke="#2adaea" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" clip-path="url(#gc)"/>
      <text x="${W/2}" y="16" text-anchor="middle" fill="#7adaea" font-size="12" font-weight="bold" font-family="Arial">${titleStr}</text>
    </svg>`;
  }

  // ── Gauge SVGs ────────────────────────────────────────────────────────────

  _makeTempGauge(temp, high, low) {
    const S = 130, C = 65, R = 51;
    const col = this._tempColor(temp);
    const tV = parseFloat(temp);
    const pct = isNaN(tV) ? 0 : Math.min(Math.max(tV / 120, 0), 1);
    const sA = 148, tA = 244, eA = sA + pct * tA;
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <defs>
        <linearGradient id="tgg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${col.stop0}"/><stop offset="100%" stop-color="${col.stop1}"/>
        </linearGradient>
        <filter id="tgf"><feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/><feBlend in="SourceGraphic" in2="b" mode="screen"/></filter>
      </defs>
      <path d="${this._arc(C,C,R,sA,sA+tA)}" fill="none" stroke="#0a1e1e" stroke-width="12" stroke-linecap="round"/>
      ${!isNaN(tV) ? `<path d="${this._arc(C,C,R,sA,Math.min(eA,sA+tA-1))}" fill="none" stroke="url(#tgg)" stroke-width="12" stroke-linecap="round" filter="url(#tgf)"/>` : ''}
      <circle cx="${C}" cy="${C}" r="54" fill="none" stroke="#0a1a1a" stroke-width="1"/>
      ${high !== '--' ? `<text x="${C-22}" y="${C-15}" fill="${col.stop0}" font-size="10" font-family="Arial" opacity="0.9">↑ ${high}°</text>` : ''}
      ${low  !== '--' ? `<text x="${C-22}" y="${C+24}" fill="${col.stop0}" font-size="10" font-family="Arial" opacity="0.9">↓ ${low}°</text>` : ''}
      <text x="${C}" y="${C+9}" text-anchor="middle" fill="${col.text}" font-size="28" font-weight="900" font-family="Arial">${temp}</text>
      <text x="${C+26}" y="${C-3}" fill="${col.stop0}" font-size="12" font-family="Arial" opacity="0.85">°</text>
    </svg>`;
  }

  _makeWindGauge(speed, gust, dir, dirDeg, unit) {
    const S = 130, C = 65, R = 48;
    const deg = dirDeg !== null ? dirDeg : 0;
    const rad = d => (d - 90) * Math.PI / 180;
    const nL = R*0.72, tL = R*0.28;
    const nx = C+nL*Math.cos(rad(deg)), ny = C+nL*Math.sin(rad(deg));
    const tx = C-tL*Math.cos(rad(deg)), ty = C-tL*Math.sin(rad(deg));
    const pw = 5, perp = rad(deg+90);
    const ap1x = C+(nL-9)*Math.cos(rad(deg))+pw*Math.cos(perp), ap1y = C+(nL-9)*Math.sin(rad(deg))+pw*Math.sin(perp);
    const ap2x = C+(nL-9)*Math.cos(rad(deg))-pw*Math.cos(perp), ap2y = C+(nL-9)*Math.sin(rad(deg))-pw*Math.sin(perp);
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
      <defs><radialGradient id="wgb"><stop offset="0%" stop-color="#0d2028"/><stop offset="100%" stop-color="#050d10"/></radialGradient></defs>
      <circle cx="${C}" cy="${C}" r="${C-2}" fill="#060f14" stroke="#1a3540" stroke-width="2"/>
      <circle cx="${C}" cy="${C}" r="${R+4}" fill="url(#wgb)" stroke="#0f2a35" stroke-width="1.5"/>
      ${[0,45,90,135,180,225,270,315].map(a => {
        const maj=a%90===0, r2=(a-90)*Math.PI/180, r1i=R+1, r2i=r1i-(maj?7:4);
        return `<line x1="${C+r1i*Math.cos(r2)}" y1="${C+r1i*Math.sin(r2)}" x2="${C+r2i*Math.cos(r2)}" y2="${C+r2i*Math.sin(r2)}" stroke="${maj?'#2a7080':'#0f3540'}" stroke-width="${maj?1.5:1}"/>`;
      }).join('')}
      <text x="${C}" y="${C-R+11}" text-anchor="middle" fill="#3ab8cc" font-size="10" font-weight="bold" font-family="Arial">N</text>
      <text x="${C}" y="${C+R-2}" text-anchor="middle" fill="#1a6070" font-size="8" font-family="Arial">S</text>
      <text x="${C+R-3}" y="${C+4}" text-anchor="middle" fill="#1a6070" font-size="8" font-family="Arial">E</text>
      <text x="${C-R+3}" y="${C+4}" text-anchor="middle" fill="#1a6070" font-size="8" font-family="Arial">W</text>
      <text x="${C-20}" y="${C-20}" text-anchor="middle" fill="#5adaea" font-size="10" font-weight="bold" font-family="Arial">${dir}</text>
      <text x="${C+24}" y="${C-24}" text-anchor="end" fill="#3aaabb" font-size="9" font-family="Arial">${speed}°</text>
      ${dirDeg !== null ? `
        <line x1="${C}" y1="${C}" x2="${tx}" y2="${ty}" stroke="#607080" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>
        <line x1="${C}" y1="${C}" x2="${nx}" y2="${ny}" stroke="#3abccc" stroke-width="2.5" stroke-linecap="round"/>
        <polygon points="${nx},${ny} ${ap1x},${ap1y} ${ap2x},${ap2y}" fill="#3abccc"/>
        <circle cx="${C}" cy="${C}" r="4" fill="#3abccc" stroke="#0a2030" stroke-width="1.5"/>` : ''}
      <text x="${C}" y="${C+16}" text-anchor="middle" fill="#d0f0ff" font-size="26" font-weight="900" font-family="Arial">${speed}</text>
      <text x="${C}" y="${C+27}" text-anchor="middle" fill="#3a8898" font-size="8" font-family="Arial">Gust ${gust}</text>
      <text x="${C}" y="${C+38}" text-anchor="middle" fill="#2a6070" font-size="8" font-family="Arial">${unit}</text>
    </svg>`;
  }

  _makeSmallGauge(id, value, isHum, size = 90) {
    const C = size/2, R = size*0.36, tW = size*0.11;
    const col = isHum ? this._humColor(value) : this._tempColor(value);
    const vf = parseFloat(value);
    const pct = isNaN(vf) ? 0 : isHum ? Math.min(Math.max(vf/100,0),1) : Math.min(Math.max(vf/120,0),1);
    const sA = 135, tA = 270, eA = sA + pct * tA;
    const dV = isHum ? `${value}%` : value;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs><linearGradient id="${id}g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${col.stop0}"/><stop offset="100%" stop-color="${col.stop1}"/>
      </linearGradient></defs>
      <path d="${this._arc(C,C,R,sA,sA+tA)}" fill="none" stroke="#0a1818" stroke-width="${tW}" stroke-linecap="round"/>
      ${!isNaN(vf) ? `<path d="${this._arc(C,C,R,sA,Math.min(eA,sA+tA-1))}" fill="none" stroke="url(#${id}g)" stroke-width="${tW}" stroke-linecap="round"/>` : ''}
      <text x="${C}" y="${C+size*0.07}" text-anchor="middle" fill="${col.stop0}" font-size="${size*0.2}" font-weight="bold" font-family="Arial">${dV}</text>
      ${isHum ? '' : `<text x="${C+R*0.7}" y="${C-R*0.5}" fill="${col.stop0}" font-size="${size*0.11}" font-family="Arial" opacity="0.8">°</text>`}
    </svg>`;
  }

  // ── Graph overlay helpers ─────────────────────────────────────────────────

  _openGraph(eid, label, unit) {
    if (!eid || eid === 'undefined') return;
    this._graphEntity = eid;
    this._graphLabel  = label;
    this._graphUnit   = unit;
    this._resetGraphTimer();
    // Show immediately with whatever data we have, then refresh from HA
    this._updateOverlay();
    this._fetchHistory().then(() => this._updateOverlay());
  }

  _closeGraph() {
    this._graphEntity = null;
    if (this._graphTimeout) { clearTimeout(this._graphTimeout); this._graphTimeout = null; }
    this._updateOverlay();
  }

  _resetGraphTimer() {
    if (this._graphTimeout) clearTimeout(this._graphTimeout);
    this._graphTimeout = setTimeout(() => this._closeGraph(), 120000);
  }

  _updateOverlay() {
    const overlay = this.shadowRoot && this.shadowRoot.querySelector('.graph-overlay');
    if (!overlay) return;
    if (!this._graphEntity) { overlay.style.display = 'none'; return; }
    overlay.querySelector('.graph-svg-wrap').innerHTML =
      this._makeLargeGraph(this._graphEntity, this._graphLabel, this._graphUnit);
    overlay.style.display = 'flex';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this._config) return;
    const cfg = this._config;

    const outTemp     = this._s(cfg.outdoor_temp, 1);
    const outHigh     = this._s(cfg.outdoor_temp_high, 1);
    const outLow      = this._s(cfg.outdoor_temp_low, 1);
    const outHum      = this._s(cfg.outdoor_humidity, 0);
    const feelsLike   = this._s(cfg.feels_like, 1);
    const dewPt       = this._s(cfg.dew_point, 1);
    const windSpd     = this._s(cfg.wind_speed, 1);
    const windGust    = this._s(cfg.wind_gust, 1);
    const windDir     = this._windDirLabel();
    const windDirDeg  = this._windDirDeg();
    const wind10      = this._s(cfg.wind_avg_10min, 1);
    const windMax     = this._s(cfg.wind_max_daily, 1);
    const inTemp      = this._s(cfg.indoor_temp, 1);
    const inHum       = this._s(cfg.indoor_humidity, 0);
    const pressAbs    = this._s(cfg.pressure_abs, 2);
    const pressChange = this._s(cfg.pressure_change, 2);
    const pressTrend  = this._pressureTrendArrow();
    const rainRate    = this._s(cfg.rain_rate, 2);
    const rainEvent   = this._s(cfg.rain_event, 2);
    const rainHourly  = this._s(cfg.rain_hourly, 2);
    const rainDaily   = this._s(cfg.rain_daily, 2);
    const rainWeekly  = this._s(cfg.rain_weekly, 2);
    const rainMonthly = this._s(cfg.rain_monthly, 2);
    const rainYearly  = this._s(cfg.rain_yearly, 2);
    const uvIdx       = this._s(cfg.uv_index, 0);
    const solar       = this._s(cfg.solar_radiation, 3);
    const pm25out     = this._s(cfg.pm25_outdoor, 0);
    const pm25in      = this._s(cfg.pm25_indoor, 0);
    const soilMoist   = this._s(cfg.soil_moisture, 0);

    const windUnit  = this._unit(cfg.wind_speed, 'mph');
    const rainUnit  = this._unit(cfg.rain_daily, 'in');
    const pressUnit = this._unit(cfg.pressure_abs, 'inHg');
    const tempUnit  = this._unit(cfg.outdoor_temp, '°F');

    const now     = new Date();
    // Time string from toLocaleTimeString already includes AM/PM — no need to add it manually
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });

    const rainDailyF = parseFloat(rainDaily);
    const drops = [0,1,2,3].map(i =>
      `<div class="drop ${!isNaN(rainDailyF) && rainDailyF > i*0.25 ? 'active' : 'inactive'}">
        <svg viewBox="0 0 12 16"><path d="M6 0 C6 0 0 8 0 11 A6 6 0 0 0 12 11 C12 8 6 0 6 0Z"/></svg>
      </div>`
    ).join('');

    const pressF = parseFloat(pressAbs);
    const wxIcon = pressF > 30.2 ? '☀️' : pressF > 29.8 ? '⛅' : pressF > 29.2 ? '☁️' : '⛈️';

    // Sparklines: 130px wide, ~28px tall (≈20% of 130px dial height)
    const tempSpark = this._makeMiniGraph(cfg.outdoor_temp, '#ffa726', 130, 27);
    const windSpark = this._makeMiniGraph(cfg.wind_speed,   '#3abccc', 130, 27);

    this.shadowRoot.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;900&family=Orbitron:wght@400;700&display=swap');
      :host { display:block; font-family:'Roboto',sans-serif; }
      * { box-sizing:border-box; margin:0; padding:0; }

      .ws-scale-wrapper { display:inline-block; transform-origin:top left; }

      .ws {
        background:#000; border:3px solid #0a1a1a; border-radius:6px;
        color:#ccc; overflow:hidden; user-select:none; min-width:600px;
        position:relative;
      }

      /* ── TOP BAR ── */
      .top-bar {
        background:#040c0e; border-bottom:1px solid #0a2020;
        display:flex; align-items:center; gap:8px; padding:4px 8px; font-size:11px;
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

      /* ── GAUGE ROW ── */
      .gauge-row {
        display:grid; grid-template-columns:138px 138px 1fr;
        border-bottom:1px solid #0a2020;
      }
      /* Clickable cells get a subtle hover */
      .clickable {
        cursor:pointer; transition:background 0.15s;
      }
      .clickable:hover { background:rgba(42,186,204,0.06); }

      .g-cell {
        display:flex; flex-direction:column; align-items:center; justify-content:flex-end;
        padding:4px 4px 6px; border-right:1px solid #0a2020;
      }
      .g-cell:last-child { border-right:none; }
      .g-spark { display:block; margin-bottom:2px; }

      /* ── CH1 ── */
      .ch1-area { display:flex; flex-direction:column; }
      .ch1-header {
        font-size:10px; color:#2a7070; letter-spacing:1.5px; text-transform:uppercase;
        text-align:center; padding:5px 0 3px; border-bottom:1px solid #0a2020;
      }
      .ch1-gauges { display:grid; grid-template-columns:1fr 1fr; flex:1; }
      .ch1-gauge {
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        padding:6px 4px; border-right:1px solid #0a2020; position:relative;
      }
      .ch1-gauge:last-child { border-right:none; }
      .ch1-label { font-size:9px; color:#2a7070; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
      .ch-badge { position:absolute; bottom:5px; right:5px; border:1px solid #1a4040; border-radius:2px; padding:0 4px; font-size:8px; color:#2a6070; }

      /* ── STATS BAR ── */
      .stats-bar {
        display:flex; align-items:center; border-bottom:1px solid #0a2020;
        padding:5px 10px; gap:2px; flex-wrap:wrap; background:#030b0e;
      }
      .st { display:flex; flex-direction:column; align-items:flex-start; padding:0 10px 0 0; }
      .st-lbl { font-size:8px; color:#2a6070; letter-spacing:0.5px; text-transform:uppercase; }
      .st-val { font-size:14px; font-weight:700; color:#d0e8f0; }
      .st-u { font-size:9px; color:#3a7080; }
      .vdiv { width:1px; height:32px; background:#0a2020; margin:0 6px; flex:0 0 auto; }
      .pm-col { display:flex; flex-direction:column; gap:3px; font-size:10px; padding-right:8px; }
      .pm-dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:3px; vertical-align:middle; }
      .pm-o { background:#e8c820; } .pm-i { background:#80d040; }
      .moon-col { display:flex; flex-direction:column; align-items:center; font-size:9px; color:#6a8a7a; gap:1px; }
      .moon-e { font-size:22px; line-height:1; }

      /* ── BOTTOM ROW ── */
      .bottom-row { display:grid; grid-template-columns:1fr 1fr; border-bottom:1px solid #0a2020; min-height:130px; }
      .rain-panel { border-right:1px solid #0a2020; display:flex; flex-direction:column; }
      .rain-top { display:grid; grid-template-columns:105px 1fr; flex:1; }
      .rain-drop-col {
        border-right:1px solid #0a2020;
        display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px;
      }
      .rain-drop-em { font-size:38px; line-height:1; }
      .rain-sub { font-size:9px; color:#1a5070; letter-spacing:1px; text-transform:uppercase; margin-top:3px; }
      .rain-rate-sm { font-size:10px; color:#2a6080; margin-top:4px; text-align:center; }
      .rain-big-col { padding:10px 14px; display:flex; flex-direction:column; justify-content:center; }
      .rain-big-val { font-family:'Orbitron',monospace; font-size:36px; font-weight:700; color:#1a88f0; line-height:1; }
      .rain-big-unit { font-size:14px; color:#1a6090; margin-left:4px; }
      .rain-big-lbl { font-size:9px; color:#1a5070; letter-spacing:1px; text-transform:uppercase; margin-top:2px; }
      .rain-table-grid {
        display:grid; grid-template-columns:1fr 1fr; gap:1px 10px;
        border-top:1px solid #0a2020; padding:6px 12px; background:#030a0e;
      }
      .rtr { display:flex; justify-content:space-between; font-size:11px; padding:1px 2px; border-radius:2px; }
      .rtr-lbl { color:#2a6070; } .rtr-val { color:#1a88f0; font-weight:700; }

      /* ── PRESSURE ── */
      .pressure-panel { padding:8px 14px; display:flex; flex-direction:column; gap:6px; background:#030b0a; }
      .press-hdr { font-size:10px; color:#2a6a5a; letter-spacing:1px; text-transform:uppercase; border-bottom:1px solid #0a2018; padding-bottom:4px; }
      .press-main { display:flex; align-items:center; gap:8px; }
      .press-abs-tag { font-size:11px; font-weight:700; color:#3a9a7a; }
      .press-val { font-family:'Orbitron',monospace; font-size:32px; font-weight:700; color:#c8e8d0; line-height:1; }
      .press-unit { font-size:13px; color:#3a7a5a; margin-left:3px; }
      .press-arrow { font-size:20px; color:#3abcaa; border:1px solid #1a5044; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; }
      .press-change { font-size:11px; color:#3a9a6a; padding-left:32px; }
      .press-wx { display:flex; align-items:center; justify-content:flex-end; margin-top:2px; }
      .wx-icon { font-size:28px; }

      /* ── UV/SOLAR ── */
      .uv-solar-bar {
        display:flex; align-items:center; gap:12px; padding:5px 12px;
        background:#020809; border-top:1px solid #0a1818; flex-wrap:wrap;
      }
      .solar-val { font-size:17px; font-weight:700; color:#d8d040; }
      .solar-unit { font-size:9px; color:#6a6820; }
      .uv-val { font-size:19px; font-weight:900; color:#e0e0d0; }
      .uv-lbl { font-size:10px; color:#6a6a6a; }
      .vdiv2 { width:1px; height:22px; background:#0a1818; }
      .sun-times { margin-left:auto; display:flex; gap:14px; font-size:11px; color:#6a6040; }
      .sun-t { color:#b0a040; font-weight:700; }

      /* ── GRAPH OVERLAY ── */
      .graph-overlay {
        display:none; position:absolute; inset:0; z-index:20;
        background:rgba(0,5,8,0.95);
        flex-direction:column; align-items:center; justify-content:center; gap:16px;
      }
      .graph-close-btn {
        background:#0a2a2a; border:1px solid #1a6060; color:#5adaea;
        font-size:13px; font-family:'Roboto',sans-serif; font-weight:500;
        padding:8px 32px; border-radius:4px; cursor:pointer; letter-spacing:1.5px;
        transition:background 0.15s;
      }
      .graph-close-btn:hover { background:#0f3a3a; }
      .graph-hint { font-size:10px; color:#1a4a4a; letter-spacing:1px; }
    </style>

    <div class="ws-scale-wrapper">
    <div class="ws">

      <!-- GRAPH OVERLAY -->
      <div class="graph-overlay">
        <div class="graph-svg-wrap"></div>
        <button class="graph-close-btn">✕  CLOSE</button>
        <div class="graph-hint">Auto-closes after 2 minutes of inactivity</div>
      </div>

      <!-- TOP BAR -->
      <div class="top-bar">
        <span class="wu-logo">wu</span>
        <div class="top-icons">
          <span title="Cloud">☁</span>
          <span title="Signal">📶</span>
          <span title="Sensor">📡</span>
        </div>
        <div class="drops">${drops}</div>
        <div class="soil-info">${soilMoist !== '--' ? `🌱 CH4 Soil Moisture: ${soilMoist} %` : ''}</div>
        <div class="datetime">
          <div class="date-line">${dateStr}</div>
          <div class="time-line">${timeStr}</div>
        </div>
      </div>

      <!-- GAUGE ROW -->
      <div class="gauge-row">

        <!-- Outdoor Temp + sparkline -->
        <div class="g-cell clickable"
             data-eid="${cfg.outdoor_temp}" data-lbl="Outdoor Temperature" data-unit="${tempUnit}">
          <span class="g-spark">${tempSpark}</span>
          ${this._makeTempGauge(outTemp, outHigh, outLow)}
        </div>

        <!-- Wind + sparkline -->
        <div class="g-cell clickable"
             data-eid="${cfg.wind_speed}" data-lbl="Wind Speed" data-unit="${windUnit}">
          <span class="g-spark">${windSpark}</span>
          ${this._makeWindGauge(windSpd, windGust, windDir, windDirDeg, windUnit)}
        </div>

        <!-- CH1 Indoor Temp + Humidity -->
        <div class="ch1-area">
          <div class="ch1-header">T&amp;H CH1</div>
          <div class="ch1-gauges">
            <div class="ch1-gauge clickable"
                 data-eid="${cfg.indoor_temp}" data-lbl="Indoor Temperature" data-unit="${tempUnit}">
              ${this._makeSmallGauge('it', inTemp, false, 90)}
              <div class="ch1-label">Temperature</div>
            </div>
            <div class="ch1-gauge clickable"
                 data-eid="${cfg.indoor_humidity}" data-lbl="Indoor Humidity" data-unit="%">
              ${this._makeSmallGauge('ih', inHum, true, 90)}
              <div class="ch1-label">Humidity</div>
              <div class="ch-badge">CH</div>
            </div>
          </div>
        </div>
      </div>

      <!-- STATS BAR -->
      <div class="stats-bar">
        <div class="st clickable" data-eid="${cfg.feels_like}" data-lbl="Feels Like" data-unit="${tempUnit}">
          <span class="st-lbl">Feels Like</span><span class="st-val">${feelsLike}<span class="st-u">°</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="st clickable" data-eid="${cfg.dew_point}" data-lbl="Dew Point" data-unit="${tempUnit}">
          <span class="st-lbl">Dewpoint</span><span class="st-val">${dewPt}<span class="st-u">°</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="st clickable" data-eid="${cfg.outdoor_humidity}" data-lbl="Outdoor Humidity" data-unit="%">
          <span class="st-lbl">Humidity</span><span class="st-val">${outHum}<span class="st-u">%</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="st clickable" data-eid="${cfg.wind_avg_10min}" data-lbl="10-Min Avg Wind" data-unit="${windUnit}">
          <span class="st-lbl">10Min.Avg</span><span class="st-val" style="font-size:12px;">${windDir} ${wind10}</span>
        </div>
        <div class="vdiv"></div>
        <div class="st clickable" data-eid="${cfg.wind_max_daily}" data-lbl="Max Daily Gust" data-unit="${windUnit}">
          <span class="st-lbl">Max Daily Gust</span><span class="st-val">${windMax}</span>
        </div>
        <div class="vdiv"></div>
        <div class="pm-col clickable" data-eid="${cfg.pm25_outdoor}" data-lbl="Outdoor PM2.5" data-unit="µg/m³">
          <span><span class="pm-dot pm-o"></span><span style="color:#c0a820;">OUT: ${pm25out !== '--' ? pm25out+' µg/m³' : '--'}</span></span>
          <span><span class="pm-dot pm-i"></span><span style="color:#70b030;">IN: ${pm25in !== '--' ? pm25in+' µg/m³' : '--'}</span></span>
        </div>
        <div class="vdiv"></div>
        <div class="moon-col">
          <span class="moon-e">${this._moonEmoji()}</span>
          <span>${this._moonPhase()}</span>
        </div>
      </div>

      <!-- BOTTOM ROW -->
      <div class="bottom-row">

        <!-- Rain panel -->
        <div class="rain-panel">
          <div class="rain-top">
            <div class="rain-drop-col clickable"
                 data-eid="${cfg.rain_rate}" data-lbl="Rain Rate" data-unit="${rainUnit}/hr">
              <div class="rain-drop-em">💧</div>
              <div class="rain-sub">Daily Rain</div>
              <div class="rain-rate-sm">Rate<br>${rainRate} ${rainUnit}/h</div>
            </div>
            <div class="rain-big-col clickable"
                 data-eid="${cfg.rain_daily}" data-lbl="Daily Rain" data-unit="${rainUnit}">
              <div><span class="rain-big-val">${rainDaily}</span><span class="rain-big-unit">${rainUnit}</span></div>
              <div class="rain-big-lbl">Daily Rain</div>
            </div>
          </div>
          <div class="rain-table-grid">
            <div class="rtr clickable" data-eid="${cfg.rain_event}"   data-lbl="Event Rain"   data-unit="${rainUnit}"><span class="rtr-lbl">Event</span><span class="rtr-val">${rainEvent} ${rainUnit}</span></div>
            <div class="rtr clickable" data-eid="${cfg.rain_weekly}"  data-lbl="Weekly Rain"  data-unit="${rainUnit}"><span class="rtr-lbl">Weekly</span><span class="rtr-val">${rainWeekly} ${rainUnit}</span></div>
            <div class="rtr clickable" data-eid="${cfg.rain_hourly}"  data-lbl="Hourly Rain"  data-unit="${rainUnit}"><span class="rtr-lbl">Hourly</span><span class="rtr-val">${rainHourly} ${rainUnit}</span></div>
            <div class="rtr clickable" data-eid="${cfg.rain_monthly}" data-lbl="Monthly Rain" data-unit="${rainUnit}"><span class="rtr-lbl">Monthly</span><span class="rtr-val">${rainMonthly} ${rainUnit}</span></div>
            <div class="rtr clickable" style="grid-column:1/-1;"
                 data-eid="${cfg.rain_yearly}" data-lbl="Yearly Rain" data-unit="${rainUnit}"><span class="rtr-lbl">Yearly</span><span class="rtr-val">${rainYearly} ${rainUnit}</span></div>
          </div>
        </div>

        <!-- Pressure panel -->
        <div class="pressure-panel clickable"
             data-eid="${cfg.pressure_abs}" data-lbl="Barometric Pressure" data-unit="${pressUnit}">
          <div class="press-hdr">Barometer Reading</div>
          <div class="press-main">
            <span class="press-abs-tag">ABS</span>
            <div><span class="press-val">${pressAbs}</span><span class="press-unit">${pressUnit}</span></div>
            <div class="press-arrow">${pressTrend}</div>
          </div>
          <div class="press-change">${pressChange !== '--' ? pressChange + ' ' + pressUnit : ''}</div>
          <div class="press-wx"><span class="wx-icon">${wxIcon}</span></div>
        </div>
      </div>

      <!-- UV / SOLAR BAR -->
      <div class="uv-solar-bar">
        <div class="clickable" data-eid="${cfg.solar_radiation}" data-lbl="Solar Radiation" data-unit="w/m²">
          <span class="solar-val">${solar}</span><span class="solar-unit"> w/m²</span>
        </div>
        <div class="vdiv2"></div>
        <div class="clickable" data-eid="${cfg.uv_index}" data-lbl="UV Index" data-unit="">
          <span class="uv-val">${uvIdx}</span><span class="uv-lbl"> UV Index</span>
        </div>
        <div class="sun-times">
          <span>☀ am <span class="sun-t">5:35</span></span>
          <span>pm <span class="sun-t">7:09</span> ☀</span>
        </div>
      </div>

    </div>
    </div>
    `;

    // ── Event wiring ──────────────────────────────────────────────────────
    const root = this.shadowRoot;

    root.querySelector('.graph-close-btn').addEventListener('click', e => {
      e.stopPropagation();
      this._closeGraph();
    });

    root.querySelectorAll('.clickable[data-eid]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const eid = el.dataset.eid, lbl = el.dataset.lbl, unit = el.dataset.unit;
        if (eid && eid !== 'undefined') this._openGraph(eid, lbl, unit);
      });
    });

    // Tapping the overlay background resets the auto-close timer
    root.querySelector('.graph-overlay').addEventListener('click', () => {
      if (this._graphEntity) this._resetGraphTimer();
    });

    // Restore overlay if it was open before this render cycle
    if (this._graphEntity) this._updateOverlay();

    if (this._timeInterval) clearInterval(this._timeInterval);
    this._timeInterval = setInterval(() => this.render(), 1000);
    this._setupScaling();
    requestAnimationFrame(() => this._applyScale());
  }
}

customElements.define('ws5000-weather-card', WS5000WeatherCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ws5000-weather-card',
  name: 'Weather Station Card',
  description: 'Displays weather station data styled after the Ambient Weather WS-5000 console.',
  preview: true,
});
