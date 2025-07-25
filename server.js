// server.js — Unified proxy for Pavilion (2103), Sport Court (2027), and Pool Calendar Today (HTML scrape)

const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const cheerio   = require('cheerio');
const dayjs     = require('dayjs');
const utc       = require('dayjs/plugin/utc');
const timezone  = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const app      = express();
const PORT     = process.env.PORT || 3000;
const TIMEZONE = 'America/New_York';

app.use(cors());


/**
 * Existing proxy endpoint for Pavilion and Sport Court
 */
app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate) {
      reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
    }

    const url =
      `https://www.yourcourts.com/facility/viewer/8353821` +
      `?facility_id=${facility_id}` +
      `&court_id=${court_id}` +
      `&reservationDate=${encodeURIComponent(reservationDate)}`;
    console.log(`Fetching data from ${url}`);

    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    if (facility_id === '2103') {
      const reservations = parsePavilion($);
      return res.json({ reservations });
    } else if (facility_id === '2027') {
      const reservations = parseSportCourt($);
      return res.json({ reservations });
    } else {
      return res
        .status(400)
        .json({ error: `Unsupported facility_id: ${facility_id}` });
    }

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
});


app.get('/today-events', async (req, res) => {
  try {
    const today = dayjs().tz(TIMEZONE).format('YYYY-MM-DD');
    const feedUrl =
      'https://wildwoodpool.com/wp-admin/admin-ajax.php' +
      `?action=eventorganiser-fullcal` +
      `&start=${today}` +
      `&end=${today}` +
      `&timeformat=g%3Ai%20A` +
      `&users_events=false`;

    console.log(`[today-events] Fetching calendar page to get cookies`);
    const pageResp = await axios.get('https://wildwoodpool.com/calendar/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                      'Chrome/114.0.0.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml'
      },
      withCredentials: true
    });
    const cookies = pageResp.headers['set-cookie'] || [];
    console.log(`[today-events] Obtained cookies:`, cookies);

    console.log(`[today-events] Fetching AJAX feed with cookies`);
    const response = await axios.get(feedUrl, {
      headers: {
        'User-Agent':        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                              'AppleWebKit/537.36 (KHTML, like Gecko) ' +
                              'Chrome/114.0.0.0 Safari/537.36',
        'Referer':           'https://wildwoodpool.com/calendar/',
        'Accept':            'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With':  'XMLHttpRequest',
        'Cookie':            cookies.join('; ')
      },
      responseType:   'json',
      validateStatus: () => true
    });

    console.log(`[today-events] AJAX HTTP status: ${response.status}`);
    if (response.status !== 200) {
      console.error(`[today-events] Blocked or error body:`, response.data);
      throw new Error(`HTTP ${response.status}`);
    }

    const events = response.data;
    if (!Array.isArray(events)) {
      console.error(`[today-events] Unexpected payload:`, events);
      throw new Error('Unexpected feed format');
    }

    console.log(`[today-events] Received ${events.length} events`);
    const reservations = events.map(ev => {
      const s = dayjs.tz(ev.start, TIMEZONE).format('h:mmA');
      const e = dayjs.tz(ev.end,   TIMEZONE).format('h:mmA');
      console.log(`[today-events]  → ${ev.title}: ${s} – ${e}`);
      return { title: ev.title, startTime: s, endTime: e };
    });

    return res.json({ reservations });

  } catch (err) {
    console.error(`[today-events] Error:`, err.message);
    return res.status(500).json({ error: 'Failed to fetch pool events' });
  }
});


// ────────────────────────────────────────────────────────────────────────────
// Pavilion parser (facility_id = 2103) — unchanged
// ────────────────────────────────────────────────────────────────────────────
function parsePavilion($) {
  const raw = [];
  $('tr').each((_, el) => {
    const timeText   = $(el).find('td.court-time').text().trim();
    const statusText = $(el).find('td').eq(1).text().trim();
    if (isValidTime(timeText)) {
      raw.push({ startTime: timeText, status: statusText || timeText });
    }
  });

  const filtered = raw.filter(r => r.status !== r.startTime);
  const merged = [];
  let i = 0;
  while (i < filtered.length) {
    const current = { ...filtered[i] };
    let j = i + 1;
    while (
      j < filtered.length &&
      normalizeStatus(filtered[j].status) === normalizeStatus(current.status)
    ) {
      j++;
    }
    current.endTime = filtered[j] ? filtered[j].startTime : current.startTime;
    merged.push(current);
    i = j;
  }
  for (let k = 0; k < merged.length - 1; k++) {
    merged[k].endTime = merged[k + 1].startTime;
  }
  const ignoreStatuses = [
    'Setup time','Takedown time','Setup and takedown time',
    'Open','Not open','Not available for rental'
  ];
  const cleaned = merged
    .map(r => ({
      startTime: r.startTime,
      endTime:   r.endTime,
      status:    cleanStatus(r.status)
    }))
    .filter(r => r.status && !ignoreStatuses.includes(r.status));
  if (cleaned.length > 0) {
    const last = cleaned[cleaned.length - 1];
    if (!last.endTime || last.endTime === last.startTime) {
      last.endTime = '9:00PM';
    }
  }
  return cleaned;
}


// ────────────────────────────────────────────────────────────────────────────
// Sport Court parser (facility_id = 2027) — unchanged
// ────────────────────────────────────────────────────────────────────────────
function parseSportCourt($) {
  const events = [];
  const ignoreSport = [
    'Walk-up basketball only',
    'Not available before 8am on weekends',
    'Closed','Open'
  ].map(s => s.toLowerCase());

  $('tr').each((_, el) => {
    const timeText   = $(el).find('td.court-time').text().trim();
    const statusText = $(el).find('td').eq(1).text().trim();
    if (!isValidTime(timeText)) return;
    if (!statusText.includes('-')) return;

    const lower = statusText.toLowerCase().trim();
    if (ignoreSport.includes(lower)) return;

    const m = statusText.match(
      /^(\d{1,2}:\d{2}(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}(?:AM|PM))(.*)$/
    );
    if (!m) return;

    const [, startRaw, endRaw, rest] = m;
    let person = rest.trim();
    let sport  = '';
    const sportMatch = person.match(/(Pickleball|Basketball)$/i);
    if (sportMatch) {
      sport  = sportMatch[1];
      person = person.slice(0, person.length - sport.length).trim();  
    }
    events.push({
      startTime: startRaw.toUpperCase(),
      endTime:   endRaw.toUpperCase(),
      person, sport
    });
  });

  return events;
}


// ────────────────────────────────────────────────────────────────────────────
// Helpers — unchanged
// ────────────────────────────────────────────────────────────────────────────
function isValidTime(str) {
  return /^([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)$/i.test(str);
}
function cleanStatus(status) {
  return status
    .replace(
      /^([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)\s*-\s*([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)/i,
      ''
    )
    .replace(/Member Event/gi, '')
    .trim();
}
function normalizeStatus(status) {
  return cleanStatus(status).toLowerCase();
}


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});