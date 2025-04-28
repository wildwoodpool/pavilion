const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

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

    const reservationsRaw = [];

    $('.calendar_holder .calendar_cell').each((_, el) => {
      const timeText = $(el).find('.time').text().trim();
      const reservationText = $(el).find('.reservation').text().trim();
      const backgroundColor = $(el).find('.reservation').css('background-color');

      if (timeText) {
        reservationsRaw.push({
          startTime: formatTime(timeText),
          status: reservationText || timeText, // If no reservation text, use timeText
          color: backgroundColor,
        });
      }
    });

    // Step 1: Remove placeholders (status === startTime)
    const filteredReservations = reservationsRaw.filter(r => r.status !== r.startTime);

    // Step 2: Merge identical back-to-back events even across placeholders
    const merged = [];
    for (let i = 0; i < filteredReservations.length; i++) {
      const current = { ...filteredReservations[i] };
      let j = i + 1;

      while (
        j < filteredReservations.length &&
        cleanStatus(filteredReservations[j].status) === cleanStatus(current.status)
      ) {
        j++;
      }

      current.endTime = filteredReservations[j] ? filteredReservations[j].startTime : current.startTime;
      merged.push(current);
      i = j - 1;
    }

    // Step 3: Adjust endTimes for the rest
    for (let i = 0; i < merged.length - 1; i++) {
      if (!merged[i].endTime) {
        merged[i].endTime = merged[i + 1].startTime;
      }
    }
    if (!merged[merged.length - 1].endTime) {
      merged[merged.length - 1].endTime = merged[merged.length - 1].startTime;
    }

    // Step 4: Clean output (remove unwanted events)
    const ignoreList = ['Setup time', 'Takedown time', 'Open', 'Not available for rental'];

    const finalReservations = merged
      .map(r => ({
        startTime: r.startTime,
        endTime: r.endTime,
        status: cleanStatus(r.status),
      }))
      .filter(r => r.status && !ignoreList.includes(r.status));

    console.table(finalReservations);

    res.json({ reservations: finalReservations });
  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

function formatTime(timeStr) {
  // Normalize spacing
  return dayjs(timeStr, ['h:mma', 'h:mmA']).format('h:mmA');
}

function cleanStatus(status) {
  return status.replace(/Member Event/gi, '').trim();
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
