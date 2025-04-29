// FINAL FINAL server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEZONE = 'America/New_York';

app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate) {
      reservationDate = dayjs().tz(TIMEZONE).format('M/D/YYYY');
    }

    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&court_id=${court_id}&reservationDate=${reservationDate}`;
    console.log(`Fetching data from ${url}`);

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const raw = [];

    // Step 1: Parse times and statuses
    $('tr').each((_, el) => {
      const timeText = $(el).find('td.court-time').text().trim();
      const statusText = $(el).find('td').eq(1).text().trim();

      if (isValidTime(timeText)) {
        raw.push({
          startTime: timeText,
          status: statusText || timeText
        });
      }
    });

    // Step 2: Remove placeholders (status == startTime)
    const filtered = raw.filter(r => r.status !== r.startTime);

    // Step 3: Merge consecutive identical events, including setup/takedown in the timeline
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

      // Use the next time slot (whether setup or not) as the end time
      current.endTime = filtered[j] ? filtered[j].startTime : current.startTime;
      merged.push(current);
      i = j;
    }

    // Step 4: Adjust end times based on full timeline (including ignored entries)
    for (let k = 0; k < merged.length - 1; k++) {
      merged[k].endTime = merged[k + 1].startTime;
    }

    // Step 5: Remove unwanted statuses (output only)
    const ignoreStatuses = [
      'Setup time',
      'Takedown time',
      'Setup and takedown time',
      'Open',
      'Not available for rental'
    ];

    const cleaned = merged
      .map(r => ({
        startTime: r.startTime,
        endTime: r.endTime,
        status: cleanStatus(r.status)
      }))
      .filter(r => r.status && !ignoreStatuses.includes(r.status));

    console.table(cleaned);
    res.json({ reservations: cleaned });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

function isValidTime(str) {
  return /^([0]?[1-9]|1[0-2]):[0-5][0-9](AM|PM)$/i.test(str);
}

function cleanStatus(status) {
  return status.replace(/Member Event/gi, '').trim();
}

function normalizeStatus(status) {
  return cleanStatus(status).toLowerCase();
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});