// FINAL server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

const TIMEZONE = 'America/New_York';

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

    const rawReservations = [];

    // Extract times and statuses
    $('.calendar_holder .calendar_cell').each((_, el) => {
      const timeText = $(el).find('.time').text().trim();
      const reservationText = $(el).find('.reservation').text().trim();
      if (timeText) {
        rawReservations.push({
          startTime: formatTime(timeText),
          status: reservationText || timeText // fallback if no reservation text
        });
      }
    });

    // Step 1: Remove placeholders (status = startTime)
    const filtered = rawReservations.filter(r => r.status !== r.startTime);

    // Step 2: Merge identical events
    const merged = [];
    let i = 0;
    while (i < filtered.length) {
      const current = { ...filtered[i] };
      let j = i + 1;

      while (j < filtered.length && normalizeStatus(filtered[j].status) === normalizeStatus(current.status)) {
        j++;
      }

      current.endTime = filtered[j] ? filtered[j].startTime : current.startTime;
      merged.push(current);
      i = j;
    }

    // Step 3: Remove unwanted statuses
    const ignoreStatuses = ['Setup time', 'Takedown time', 'Open', 'Not available for rental'];
    const cleaned = merged.map(r => ({
      startTime: r.startTime,
      endTime: r.endTime,
      status: cleanStatus(r.status)
    })).filter(r => r.status && !ignoreStatuses.includes(r.status));

    console.table(cleaned);

    res.json({ reservations: cleaned });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

function formatTime(timeStr) {
  return dayjs(timeStr, ['h:mmA', 'h:mm a']).format('h:mmA');
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
