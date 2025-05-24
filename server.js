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


/**
 * New route: Today’s Pool Calendar events by scraping the public HTML calendar
 */
app.get('/today-events', async (req, res) => {
  try {
    const calendarUrl = 'https://wildwoodpool.com/calendar/';
    console.log(`Scraping pool calendar HTML from ${calendarUrl}`);

    // 1) Fetch the calendar page
    const { data: html } = await axios.get(calendarUrl);
    const $ = cheerio.load(html);

    // 2) Build today's date string as shown on the calendar (e.g. "May 24, 2025")
    const todayLabel = dayjs().tz(TIMEZONE).format('MMMM D, YYYY');
    console.log(`Looking for events under date header: "${todayLabel}"`);

    const reservations = [];

    // 3) Locate the container for today’s events.
    //    Adjust selectors as needed once you inspect your page’s DOM.
    const dayContainer = $(`.eo-day-header:contains("${todayLabel}")`).parent();

    // 4) Within that container, find each event block
    dayContainer.find('.eo-event').each((_, el) => {
      const title = $(el).find('.eo-event-title').text().trim();
      const time  = $(el).find('.eo-event-time').text().trim(); // e.g. "11:30 AM – 1:30 PM"
      const [start, end] = time.split('–').map(s => s.trim());
      if (title && start && end) {
        reservations.push({ title, startTime: start, endTime: end });
      }
    });

    // 5) Return results (empty array if none found)
    return res.json({ reservations });

  } catch (error) {
    console.error('Error scraping pool calendar HTML:', error.message);
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