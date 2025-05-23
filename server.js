// server.js — Pavilion (2103) + Sport Court (2027)

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

    // 1) default to today in Eastern if not provided
    if (!reservationDate) {
      reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
    }

    // 2) fetch the HTML
    const url = `https://www.yourcourts.com/facility/viewer/8353821` +
                `?facility_id=${facility_id}` +
                `&court_id=${court_id}` +
                `&reservationDate=${encodeURIComponent(reservationDate)}`;
    console.log(`Fetching data from ${url}`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    // 3) dispatch based on facility_id
    let reservations;
    if (facility_id === '2103') {
      // ——————— PAVILION PARSING (UNCHANGED) ———————
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

      // Step 1: remove placeholders
      const filtered = raw.filter(r => r.status !== r.startTime);

      // Step 2: merge consecutive identical
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

      // Step 3: clean & filter
      const ignoreStatuses = [
        'Setup time',
        'Takedown time',
        'Open',
        'Not available for rental'
      ];
      reservations = merged
        .map(r => ({
          startTime: r.startTime,
          endTime:   r.endTime,
          status:    cleanStatus(r.status)
        }))
        .filter(r => r.status && !ignoreStatuses.includes(r.status));

    } else if (facility_id === '2027') {
      // ————— SPORT-COURT PARSING —————
      const raw = [];
      $('.calendar_holder .calendar_cell').each((_, el) => {
        const timeText = $(el).find('.court-time').text().trim();
        let desc       = $(el).find('.reservation').text().trim();
        if (!timeText) return;

        // fix missing space: "Vice PresidentPickleball" → "Vice President Pickleball"
        desc = desc.replace(/([a-z])([A-Z])/g, '$1 $2');

        const startTime = formatTime(timeText);
        const ignore    = [
          'Walk-up basketball only',
          'Not available before 8am on weekends',
          'Closed'
        ];

        if (desc === startTime || ignore.includes(desc) || !desc) {
          raw.push({ placeholder: true, startTime });
        } else {
          raw.push({ placeholder: false, startTime, status: desc });
        }
      });

      // merge only the real reservations
      const events = [];
      let k = 0;
      while (k < raw.length) {
        if (raw[k].placeholder) { k++; continue; }

        const { startTime, status } = raw[k];
        let count = 1, j = k + 1;
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
        k = j;
      }

      reservations = events;
    } else {
      return res
        .status(400)
        .json({ error: `Unsupported facility_id: ${facility_id}` });
    }

    // 4) return
    return res.json({ reservations });

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch or parse data' });
  }
});

// ————————————————
// Helpers
// ————————————————
function formatTime(str) {
  return dayjs(str, ['h:mmA','h:mm a']).format('h:mmA');
}

function cleanStatus(txt) {
  return txt.replace(/Member Event/gi, '').trim();
}

function normalizeStatus(txt) {
  return cleanStatus(txt).toLowerCase();
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});