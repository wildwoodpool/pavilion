import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import cors from 'cors';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

const app = express();
const port = process.env.PORT || 3000;

dayjs.extend(utc);
dayjs.extend(timezone);

app.use(cors());

app.get('/proxy', async (req, res) => {
  try {
    let { reservationDate, facility_id, court_id } = req.query;

    if (!facility_id || !court_id) {
      return res.status(400).json({ message: 'Missing facility_id or court_id' });
    }

    if (!reservationDate) {
      reservationDate = dayjs().tz('America/New_York').format('M/D/YYYY');
    }

    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}?reservationDate=${reservationDate}&court_id=${court_id}`;

    console.log(`Fetching data from ${url}`);

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    const rows = $('td.reservation-grid-cell');
    let reservations = [];

    rows.each((index, element) => {
      const time = $(element).attr('data-time')?.trim();
      let status = $(element).text().trim();

      if (time && status) {
        // If status includes "Member Event", remove it
        status = status.replace('Member Event', '').trim();

        reservations.push({
          startTime: time,
          status,
        });
      }
    });

    // Set endTimes based on the next startTime
    for (let i = 0; i < reservations.length; i++) {
      reservations[i].endTime = reservations[i + 1]?.startTime || reservations[i].startTime;
    }

    // Now filter out "empty" events where the status is just a time (like '4:00PM')
    const filteredReservations = reservations.filter(r => {
      return !(r.status.match(/^\d{1,2}:\d{2}(AM|PM)$/i));
    });

    // Further filter out unwanted statuses
    const ignoredStatuses = [
      'Setup time',
      'Setup and takedown time',
      'Takedown time',
      'Open',
      'Not available for rental'
    ];

    const finalReservations = filteredReservations.filter(r => !ignoredStatuses.includes(r.status));

    console.table(finalReservations);

    res.json({ reservations: finalReservations });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error);
    res.status(500).json({ message: 'Error fetching reservation data.' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
