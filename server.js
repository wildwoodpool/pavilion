// server.js — Unified proxy for Pavilion (2103), Sport Court (2027), and Pool Calendar Today

const express   = require('express');
const cors      = require('cors');
const axios     = require('axios');
const cheerio   = require('cheerio');
const dayjs     = require('dayjs');
const utc       = require('dayjs/plugin/utc');
const timezone  = require('dayjs/plugin/timezone');
const ical      = require('node-ical');
const { RRule } = require('rrule');

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

    // default to today in Eastern if none provided
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
 * New route: Today’s Pool Calendar events from ICS feed
 */
app.get('/today-events', async (req, res) => {
  try {
    const icsUrl = 'https://wildwoodpool.com/feed/eo-events?ical=1';
    console.log(`Fetching pool calendar ICS from ${icsUrl}`);

    // Fetch the ICS feed
    const { data: icsData } = await axios.get(icsUrl);
    if (typeof icsData !== 'string' || !icsData.includes('BEGIN:VCALENDAR')) {
      throw new Error('Invalid ICS data');
    }

    // Parse all components
    const parsed = ical.parseICS(icsData);

    // Define today’s window in ET
    const startOfDay = dayjs().tz(TIMEZONE).startOf('day').toDate();
    const endOfDay   = dayjs().tz(TIMEZONE).endOf('day').toDate();

    const occurrences = [];

    // Iterate through VEVENTs
    for (const evt of Object.values(parsed)) {
      if (evt.type !== 'VEVENT') continue;

      // Single-instance event
      if (!evt.rrule) {
        const evStart = dayjs(evt.start).tz(TIMEZONE).toDate();
        if (evStart >= startOfDay && evStart <= endOfDay) {
          occurrences.push({
            start: evStart,
            end:   dayjs(evt.end).tz(TIMEZONE).toDate(),
            summary: evt.summary || ''
          });
        }
      } else {
        // Recurring event: expand occurrences for today
        const between = evt.rrule.between(startOfDay, endOfDay, true);
        between.forEach(dt => {
          // Skip exceptions
          const exDates = evt.exdate || {};
          if (exDates[dt.toISOString().substr(0,10)]) return;

          // Compute end by duration
          const durationMs = evt.end.getTime() - evt.start.getTime();
          occurrences.push({
            start: dt,
            end:   new Date(dt.getTime() + durationMs),
            summary: evt.summary || ''
          });
        });
      }
    }

    // Map to JSON shape
    const reservations = occurrences.map(o => {
      const s = dayjs(o.start).tz(TIMEZONE);
      const e = dayjs(o.end).tz(TIMEZONE);
      return {
        startTime: s.format('h:mmA'),
        endTime:   e.format('h:mmA'),
        title:     o.summary
      };
    });

    return res.json({ reservations });

  } catch (error) {
    console.error('Error fetching or parsing pool calendar:', error.message);
    return res.status(500).json({ error: 'Failed to fetch pool events' });
  }
});


// ────────────────────────────────────────────────────────────────────────────
// Pavilion parser (facility_id = 2103)
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

  // Remove placeholders
  const filtered = raw.filter(r => r.status !== r.startTime);

  // Merge consecutive identical statuses
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

  // Shift endTimes
  for (let k = 0; k < merged.length - 1; k++) {
    merged[k].endTime = merged[k + 1].startTime;
  }

  // Clean and filter unwanted
  const ignore = [
    'Setup time','Takedown time','Setup and takedown time',
    'Open','Not open','Not available for rental'
  ];
  const cleaned = merged
    .map(r => ({
      startTime: r.startTime,
      endTime:   r.endTime,
      status:    cleanStatus(r.status)
    }))
    .filter(r => r.status && !ignore.includes(r.status));

  // Last-event fallback
  if (cleaned.length > 0) {
    const last = cleaned[cleaned.length - 1];
    if (!last.endTime || last.endTime === last.startTime) {
      last.endTime = '9:00PM';
    }
  }

  return cleaned;
}


// ────────────────────────────────────────────────────────────────────────────
// Sport Court parser (facility_id = 2027)
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
    const startTime = startRaw.toUpperCase();
    const endTime   = endRaw.toUpperCase();
    let person = rest.trim();
    let sport  = '';
    const sportMatch = person.match(/(Pickleball|Basketball)$/i);
    if (sportMatch) {
      sport  = sportMatch[1];
      person = person.slice(0, person.length - sport.length).trim();  
    }

    events.push({ startTime, endTime, person, sport });
  });

  return events;
}


// ────────────────────────────────────────────────────────────────────────────
// Helpers
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