const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/proxy', async (req, res) => {
  const { reservationDate, facility_id, court_id } = req.query;

  try {
    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate || dayjs().format('M/D/YYYY')}&court_id=${court_id}`;
    const { data } = await axios.get(url);

    const $ = cheerio.load(data);
    const reservations = [];

    // Parsing the reservation times
    $('tr').each((i, row) => {
      const startTime = $(row).find('.court-time').text().trim();
      const status = $(row).find('td').last().text().trim();

      // Skip rows where startTime equals status
      if (!startTime || status === startTime || status === 'Open' || status.includes('Setup') || status.includes('Takedown')) return;

      // Add the reservation if it's valid
      const endTime = $(row).next().find('.court-time').text().trim() || startTime;

      reservations.push({ startTime, status, endTime });
    });

    // Now group back-to-back events with the same text into one reservation
    const groupedReservations = [];
    let currentReservation = null;

    reservations.forEach((res, index) => {
      // Check if the next reservation exists
      const nextReservation = reservations[index + 1];

      if (nextReservation && currentReservation && currentReservation.status === res.status && dayjs(currentReservation.endTime, 'h:mma').isSame(dayjs(res.startTime, 'h:mma'))) {
        // Extend the end time of the current reservation to the next reservation's start time
        currentReservation.endTime = nextReservation.startTime;
      } else {
        if (currentReservation) groupedReservations.push(currentReservation);
        currentReservation = { ...res };
      }
    });

    // Add the last reservation
    if (currentReservation) groupedReservations.push(currentReservation);

    // Format as a table for output
    console.table(groupedReservations);

    res.json(groupedReservations);

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error);
    res.status(500).json({ message: 'Error fetching reservation data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
