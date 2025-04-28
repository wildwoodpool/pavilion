const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const dayjs = require('dayjs');
const cors = require('cors');
const moment = require('moment-timezone');
const { URLSearchParams } = require('url');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

app.use(cors()); // Allow cross-origin requests

// Define the route to handle the reservation data
app.get('/proxy', async (req, res) => {
  const { reservationDate, facility_id, court_id } = req.query;

  // Set the default date to today if none is provided
  const date = reservationDate || dayjs().format('MM/DD/YYYY');
  
  try {
    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${date}&court_id=${court_id}`;
    console.log(`Fetching data from ${url}`);

    // Fetch the page data from the URL
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    // Parse the reservation data from the page
    const reservations = [];
    
    $('tr[id^="time"]').each((index, element) => {
      const startTime = $(element).find('td.court-time').text().trim();
      const status = $(element).find('td').last().text().trim();
      const endTime = $(element).find('td').first().text().trim();

      if (startTime && status && endTime && status !== "Open" && !status.includes("Setup") && !status.includes("Takedown")) {
        reservations.push({
          startTime,
          status,
          endTime: endTime || startTime,
        });
      }
    });

    // Process the reservations data
    const processedReservations = processReservations(reservations);
    
    // Send the processed data as the response
    res.json(processedReservations);
  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error);
    res.status(500).json({ message: 'Error fetching data from yourcourts.com' });
  }
});

// Function to process the reservations data
function processReservations(reservations) {
  const finalReservations = [];
  let currentReservation = null;

  reservations.forEach((reservation, index) => {
    if (!currentReservation) {
      currentReservation = { ...reservation };
      return;
    }

    // If the status is the same and the times are consecutive, merge the reservations
    const currentEndTime = dayjs(currentReservation.endTime, ['h:mma', 'h:mma']).format('h:mma');
    const nextStartTime = dayjs(reservation.startTime, ['h:mma', 'h:mma']).format('h:mma');
    
    if (currentReservation.status === reservation.status && currentEndTime === nextStartTime) {
      // Extend the end time of the current reservation
      currentReservation.endTime = reservation.endTime;
    } else {
      finalReservations.push(currentReservation);
      currentReservation = { ...reservation };
    }
  });

  if (currentReservation) {
    finalReservations.push(currentReservation);
  }

  return finalReservations;
}

// Start the Express server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
