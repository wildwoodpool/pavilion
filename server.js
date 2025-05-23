// server.js — Unified proxy for Pavilion (2103) and Sport Court (2027)

const express           = require('express');
const cors              = require('cors');
const axios             = require('axios');
const cheerio           = require('cheerio');
const dayjs             = require('dayjs');
const utc               = require('dayjs/plugin/utc');
const timezone          = require('dayjs/plugin/timezone');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);

const app      = express();
const PORT     = process.env.PORT || 3000;
const TIMEZONE = 'America/New_York';

app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    // --- FIX #1: strip accidental prefix if user passed facility_id=facility_id=2027
    if (facility_id && facility_id.includes('=')) {
      facility_id = facility_id.split('=').pop();
    }

    // default to today in Eastern
    if (!reservationDate) {
      reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
    }

    // build upstream URL
    const upstream =
      `https://www.yourcourts.com/facility/viewer/8353821` +
      `?facility_id=${facility_id}` +
      `&court_id=${court_id}` +
      `&reservationDate=${encodeURIComponent(reservationDate)}`;

    console.log(`Fetching from: ${upstream}`);
    const { data: html } = await axios.get(upstream);
    const $ = cheerio.load(html);

    // dispatch to correct parser
    let reservations;
    if (facility_id === '2103') {
      reservations = parsePavilion($);
    } else if (facility_id === '2027') {
      reservations = parseSportCourt($);
    } else {
      return res
        .status(400)
        .json({ error: `Unsupported facility_id: ${facility_id}` });
    }

    return res.json({ reservations });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

// ───────────────────────
// Pavilion parser
// ───────────────────────
function parsePavilion($) {
  const raw = [];

  // Each table row with an id (e.g. “1000AM”)
  $('.calendar_holder tr[id]').each((_, row) => {
    const $row = $(row);

    // time cell has class "court-time"
    const timeText = $row.find('td.court-time').text().trim();
    if (!timeText) return;

    // status cell is the next td (may contain <span data-popup=...>)
    const $statusTd = $row.find('td').not('.court-time').first();
    let statusText = $statusTd.find('span').text().trim();
    if (!statusText) {
      statusText = $statusTd.text().trim();
    }

    raw.push({
      startTime: formatTime(timeText),
      status:    statusText || timeText
    });
  });

  // 1) Remove placeholders (status === startTime)
  const filtered = raw.filter(r => r.status !== r.startTime);

  // 2) Merge consecutive identical statuses
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

    // endTime is the startTime of the next block, or same as start if none
    current.endTime = filtered[j]
      ? filtered[j].startTime
      : current.startTime;

    merged.push(current);
    i = j;
  }

  // 3) Filter out unwanted statuses
  const ignore = [
    'Setup time',
    'Takedown time',
    'Open',
    'Not available for rental'
  ];

  return merged
    .map(r => ({
      startTime: r.startTime,
      endTime:   r.endTime,
      status:    cleanStatus(r.status)
    }))
    .filter(r => r.status && !ignore.includes(r.status));
}

// ───────────────────────
// Sport court parser
// ───────────────────────
function parseSportCourt($) {
  const raw = [];

  $('.calendar_holder .calendar_cell').each((_, el) => {
    const $cell = $(el);
    const timeText = $cell.find('.court-time').text().trim();
    if (!timeText) return;

    // status may be in .court-status
    let desc = $cell.find('.court-status').text().trim();
    // fix missing space, e.g. "PresidentPickleball"
    desc = desc.replace(/([a-z])([A-Z])/g, '$1 $2');

    const startTime = formatTime(timeText);
    const ignore   = [
      'Walk-up basketball only',
      'Not available before 8am on weekends',
      'Closed'
    ];

    if (!desc || desc === startTime || ignore.includes(desc)) {
      raw.push({ placeholder: true, startTime });
    } else {
      raw.push({ placeholder: false, startTime, status: desc });
    }
  });

  // merge only contiguous real events
  const events = [];
  let i = 0;

  while (i < raw.length) {
    if (raw[i].placeholder) {
      i++;
      continue;
    }

    const { startTime, status } = raw[i];
    let count = 1, j = i + 1;

    while (
      j < raw.length &&
      !raw[j].placeholder &&
      raw[j].status === status
    ) {
      count++;
      j++;
    }

    // compute endTime = start + 30min * count
    const endTime = dayjs(startTime, 'h:mmA')
      .add(count * 30, 'minute')
      .format('h:mmA');

    events.push({ startTime, endTime, status });
    i = j;
  }

  return events;
}

// ───────────────────────
// Helpers
// ───────────────────────
function formatTime(str) {
  return dayjs(str, ['h:mmA', 'h:mm a']).format('h:mmA');
}

function cleanStatus(txt) {
  return txt.replace(/Member Event/gi, '').trim();
}

function normalizeStatus(txt) {
  return cleanStatus(txt).toLowerCase();
}

// ───────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});