// server.js

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    // If no reservationDate provided, use today's date in MM/DD/YYYY
    if (!reservationDate) {
      reservationDate = dayjs().format('M/D/YYYY');
    }

    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
    console.log('Fetching data from:', url);

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const reservationsRaw = [];

    $('tr.reservation').each((i, el) => {
      const time = $(el).find('td.reservation-time').text().trim();
      const status = $(el).find('td.reservation-user').text().trim();

      if (time) {
        reservationsRaw.push({
          startTime: time,
          status: status || ''
        });
      }
    });

    // --- STEP 1: Remove placeholders (status equals startTime) ---
    let reservations = reservationsRaw.filter(r => r.status.toLowerCase() !== r.startTime.toLowerCase());

    // --- STEP 2: Merge consecutive identical events ---
    const mergedReservations = [];
    let i = 0;

    while (i < reservations.length) {
      const current = reservations[i];
      let j = i + 1;

      while (j < reservations.length && normalizeStatus(reservations[j].status) === normalizeStatus(current.status)) {
        j++;
      }

      const endTime = reservations[j - 1].startTime;
      mergedReservations.push({
        startTime: current.startTime,
        status: cleanStatus(current.status),
        endTime: endTime
      });

      i = j;
    }

    // --- STEP 3: Set correct end times for everything ---
    for (let k = 0; k < mergedReservations.length; k++) {
      if (k < mergedReservations.length - 1) {
        mergedReservations[k].endTime = mergedReservations[k + 1].startTime;
      } else {
        mergedReservations[k].endTime = mergedReservations[k].startTime; // last item
      }
    }

    // --- STEP 4: Filter out unwanted statuses for display ---
    const displayReservations = mergedReservations.filter(r => {
      const unwanted = ['setup time', 'takedown time', 'open', 'not available for rental'];
      return !unwanted.includes(r.status.toLowerCase());
    });

    console.table(displayReservations);

    res.json({ reservations: displayReservations });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

function normalizeStatus(status) {
  return cleanStatus(status).toLowerCase();
}

function cleanStatus(status) {
  return status.replace(/Member Event/gi, '').trim();
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
