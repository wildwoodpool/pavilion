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

    // 1) Default to today in Eastern if none provided
    if (!reservationDate) {
      reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
    }

    // 2) Build upstream URL
    const upstream = 
      `https://www.yourcourts.com/facility/viewer/8353821` +
      `?facility_id=${facility_id}` +
      `&court_id=${court_id}` +
      `&reservationDate=${encodeURIComponent(reservationDate)}`;

    console.log(`Fetching from: ${upstream}`);
    const { data: html } = await axios.get(upstream);

    // 3) Load into Cheerio
    const $ = cheerio.load(html);

    // 4) Dispatch to the appropriate parser
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

    // 5) Return JSON
    res.json({ reservations });

  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Pavilion parser (facility_id = 2103)
// ─────────────────────────────────────────────────────────────────────────────
function parsePavilion($) {
  const raw = [];
  $('.calendar_holder .calendar_cell').each((_, el) => {
    const timeText        = $(el).find('.time').text().trim();
    const reservationText = $(el).find('.reservation').text().trim();
    if (timeText) {
      raw.push({
        startTime: formatTime(timeText),
        status:    reservationText || timeText
      });
    }
  });

  // 1) Remove placeholders (status === startTime)
  const filtered = raw.filter(r => r.status !== r.startTime);

  // 2) Merge back-to-back identical statuses
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
    current.endTime = filtered[j]
      ? filtered[j].startTime
      : current.startTime;
    merged.push(current);
    i = j;
  }

  // 3) Clean and filter unwanted statuses
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


// ─────────────────────────────────────────────────────────────────────────────
// Sport Court parser (facility_id = 2027)
// ─────────────────────────────────────────────────────────────────────────────
function parseSportCourt($) {
  const raw = [];

  $('.calendar_holder .calendar_cell').each((_, el) => {
    const timeText = $(el).find('.court-time').text().trim();
    let desc       = $(el).find('.court-status').text().trim();
    if (!timeText) return;

    const startTime = formatTime(timeText);
    // fix missing spaces: "Vice PresidentPickleball" → "Vice President Pickleball"
    desc = desc.replace(/([a-z])([A-Z])/g, '$1 $2');

    // statuses to omit entirely
    const ignore = [
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

  // Merge contiguous real reservations only
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

    // endTime = startTime + (30 min × count)
    const endTime = dayjs(startTime, 'h:mmA')
      .add(count * 30, 'minute')
      .format('h:mmA');

    events.push({ startTime, endTime, status });
    i = j;
  }

  return events;
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatTime(str) {
  return dayjs(str, ['h:mmA', 'h:mm a']).format('h:mmA');
}

function cleanStatus(txt) {
  return txt.replace(/Member Event/gi, '').trim();
}

function normalizeStatus(txt) {
  return cleanStatus(txt).toLowerCase();
}


// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});