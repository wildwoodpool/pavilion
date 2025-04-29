// FINAL server.js with smart merge of identical names

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
require('dayjs/plugin/timezone');
require('dayjs/plugin/utc');
dayjs.extend(require('dayjs/plugin/utc'));
dayjs.extend(require('dayjs/plugin/timezone'));

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

    // Step 1: Remove placeholders (status == startTime)
    const filtered = rawReservations.filter(r => r.status !== r.startTime);

    // Step 2: Clean status (remove "Member Event" etc.)
    const cleaned = filtered.map(r => ({
      startTime: r.startTime,
      status: cleanStatus(r.status)
    })).filter(r => r.status && !shouldIgnoreStatus(r.status));

    // Step 3: Set end times (next event's startTime or 9:00PM)
    for (let i = 0; i < cleaned.length; i++) {
      if (i + 1 < cleaned.length) {
        cleaned[i].endTime = cleaned[i + 1].startTime;
      } else {
        cleaned[i].endTime = '9:00PM';
      }
    }

    // Step 4: Smart merge same-name events
    const merged = [];
    cleaned.forEach(res => {
      const last = merged[merged.length - 1];
      if (last && last.status === res.status) {
        // Extend last reservation
        last.endTime = res.endTime;
      } else {
        merged.push({ ...res });
      }
    });

    console.table(merged);
    res.json({ reservations: merged });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

function formatTime(timeStr) {
  return dayjs(timeStr, ['h:mmA', 'h:mm A']).format('h:mmA');
}

function cleanStatus(status) {
  return status.replace(/Member Event/gi, '').trim();
}

function shouldIgnoreStatus(status) {
  const ignore = ['Setup time', 'Takedown time', 'Open', 'Not available for rental', 'Not open'];
  return ignore.includes(status);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});