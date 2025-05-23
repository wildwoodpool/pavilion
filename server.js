// server.js — Pavilion (2103) + Sport Court (2027)
// Based on your “FINAL FINAL FINAL” baseline, with Sport-Court ignore updated to omit “Open”

const express  = require('express');
const cors     = require('cors');
const axios    = require('axios');
const cheerio  = require('cheerio');
const dayjs    = require('dayjs');
const utc      = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const app      = express();
const PORT     = process.env.PORT || 3000;
const TIMEZONE = 'America/New_York';

app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    // PAVILION BRANCH (UNCHANGED)
    if (facility_id === '2103') {
      if (!reservationDate) {
        reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
      }

      const url =
        `https://www.yourcourts.com/facility/viewer/8353821` +
        `?facility_id=${facility_id}` +
        `&court_id=${court_id}` +
        `&reservationDate=${reservationDate}`;
      console.log(`Fetching data from ${url}`);

      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const raw = [];
      $('tr').each((_, el) => {
        const timeText   = $(el).find('td.court-time').text().trim();
        const statusText = $(el).find('td').eq(1).text().trim();
        if (isValidTime(timeText)) {
          raw.push({ startTime: timeText, status: statusText || timeText });
        }
      });

      // Step 2: Remove placeholders
      const filtered = raw.filter(r => r.status !== r.startTime);

      // Step 3: Merge consecutive identical events
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

      // Step 4: Adjust end times
      for (let k = 0; k < merged.length - 1; k++) {
        merged[k].endTime = merged[k + 1].startTime;
      }

      // Step 5: Clean statuses and filter unwanted
      const ignoreStatuses = [
        'Setup time',
        'Takedown time',
        'Setup and takedown time',
        'Open',
        'Not open',
        'Not available for rental'
      ];
      const cleaned = merged
        .map(r => ({
          startTime: r.startTime,
          endTime:   r.endTime,
          status:    cleanStatus(r.status)
        }))
        .filter(r => r.status && !ignoreStatuses.includes(r.status));

      // Step 6: Last-event fallback to 9:00PM
      if (cleaned.length > 0) {
        const last = cleaned[cleaned.length - 1];
        if (!last.endTime || last.endTime === last.startTime) {
          last.endTime = '9:00PM';
        }
      }

      console.table(cleaned);
      return res.json({ reservations: cleaned });
    }

    // SPORT COURT BRANCH
    else if (facility_id === '2027') {
      if (!reservationDate) {
        reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
      }

      const url =
        `https://www.yourcourts.com/facility/viewer/8353821` +
        `?facility_id=${facility_id}` +
        `&court_id=${court_id}` +
        `&reservationDate=${reservationDate}`;
      console.log(`Fetching sport-court data from ${url}`);

      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      const raw2 = [];
      $('tr').each((_, el) => {
        const timeText   = $(el).find('td.court-time').text().trim();
        const statusText = $(el).find('td').eq(1).text().trim();
        if (isValidTime(timeText)) {
          raw2.push({ startTime: timeText, status: statusText || timeText });
        }
      });

      // Filter out placeholders & unwanted statuses (including "Open")
      const ignoreSport = [
        'Walk-up basketball only',
        'Not available before 8am on weekends',
        'Closed',
        'Open'
      ].map(s => s.toLowerCase());

      const filtered2 = raw2.filter(r => {
        const txt = r.status.trim().toLowerCase();
        return r.status !== r.startTime && !ignoreSport.includes(txt);
      });

      // Merge consecutive identical events
      const merged2 = [];
      let m = 0;
      while (m < filtered2.length) {
        const curr = { ...filtered2[m] };
        let n = m + 1;
        while (
          n < filtered2.length &&
          filtered2[n].status.trim().toLowerCase() === curr.status.trim().toLowerCase()
        ) {
          n++;
        }
        curr.endTime = filtered2[n] ? filtered2[n].startTime : curr.startTime;
        merged2.push(curr);
        m = n;
      }

      // Adjust end times
      for (let k2 = 0; k2 < merged2.length - 1; k2++) {
        merged2[k2].endTime = merged2[k2 + 1].startTime;
      }

      // Final fallback to 9:00PM
      if (merged2.length > 0) {
        const last2 = merged2[merged2.length - 1];
        if (!last2.endTime || last2.endTime === last2.startTime) {
          last2.endTime = '9:00PM';
        }
      }

      console.table(merged2);
      return res.json({ reservations: merged2 });
    }

    // Unsupported facility_id
    else {
      return res
        .status(400)
        .json({ error: `Unsupported facility_id: ${facility_id}` });
    }
  } catch (error) {
    console.error('Error fetching data:', error.message);
    return res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// ───────────────────────
// Helper functions
// ───────────────────────
function isValidTime(str) {
  return /^([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)$/i.test(str);
}

function cleanStatus(status) {
  // Strip any leading time-range
  status = status.replace(
    /^([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)\s*-\s*([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)/i,
    ''
  );
  // Remove "Member Event"
  return status.replace(/Member Event/gi, '').trim();
}

function normalizeStatus(status) {
  return cleanStatus(status).toLowerCase();
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});