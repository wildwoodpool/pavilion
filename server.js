const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const app = express();
const port = process.env.PORT || 3000;

// Define the time zone for Eastern Time (adjusted for daylight saving time)
const timeZone = 'America/New_York';

app.get('/proxy', async (req, res) => {
  try {
    const { reservationDate, facility_id, court_id } = req.query;
    
    // Fetch the page from yourcourts.com
    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
    console.log(`Fetching data from: ${url}`);
    
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Array to store the reservation data
    let reservations = [];

    // Process the reservation rows from the HTML
    $('tr').each((index, element) => {
      const time = $(element).find('td.court-time').text().trim();
      const status = $(element).find('td').last().text().trim();

      // Ignore irrelevant statuses and empty rows
      if (!time || !status || status.includes('Setup and takedown time') || status === 'Open') return;

      // Remove "Member Event" from the status
      const cleanStatus = status.replace('Member Event', '').trim();

      // Push the reservation into the array
      reservations.push({ time, status: cleanStatus });
    });

    // Format reservations and group back-to-back entries
    const formattedReservations = formatReservations(reservations);
    
    // Send formatted data as a table
    res.json({
      reservations: formattedReservations
    });

  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error.message);
    res.status(500).json({ message: 'Error fetching reservation data.' });
  }
});

// Function to group back-to-back reservations and ensure correct times
function formatReservations(reservations) {
  let formatted = [];
  let currentGroup = null;

  reservations.forEach((reservation, index) => {
    if (currentGroup) {
      if (reservation.status === currentGroup.status) {
        // If the status is the same, extend the end time
        currentGroup.endTime = reservation.time; // Update end time to latest time
      } else {
        // Push the current group and start a new one
        formatted.push(currentGroup);
        currentGroup = { startTime: reservation.time, status: reservation.status, endTime: reservation.time };
      }
    } else {
      currentGroup = { startTime: reservation.time, status: reservation.status, endTime: reservation.time };
    }

    // If this is the last reservation, push the group
    if (index === reservations.length - 1) {
      formatted.push(currentGroup);
    }
  });

  return formatted;
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
