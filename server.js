const axios = require('axios');
const dayjs = require('dayjs');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Helper function to clean up event descriptions, remove placeholders, and merge identical events.
function cleanAndFormatReservations(reservations) {
  let mergedReservations = [];

  // Step 1: Merge identical consecutive events and remove placeholders in between
  let currentEvent = null;

  for (let i = 0; i < reservations.length; i++) {
    let reservation = reservations[i];

    // Step 1a: Skip placeholders (events where the start time and status are identical)
    if (reservation.startTime === reservation.status || 
        ['Setup time', 'Open', 'Not available for rental'].includes(reservation.status)) {
      continue;
    }

    // Step 1b: Merge consecutive identical events
    if (currentEvent && currentEvent.status === reservation.status) {
      // Merge events by setting the current event's end time to the next event's end time
      currentEvent.endTime = reservation.endTime;
    } else {
      // If not identical, push the current event (if any) to the merged list
      if (currentEvent) {
        mergedReservations.push(currentEvent);
      }

      // Set current event to the new event
      currentEvent = { ...reservation };
    }
  }

  // Don't forget to add the last event
  if (currentEvent) {
    mergedReservations.push(currentEvent);
  }

  // Step 2: Remove "Member Event" from the status
  mergedReservations = mergedReservations.map(reservation => {
    // Remove "Member Event" from the status description
    reservation.status = reservation.status.replace('Member Event', '').trim();

    // Step 3: Remove events like "Setup time", "Open", etc. from the output
    if (['Setup time', 'Open', 'Not available for rental'].includes(reservation.status)) {
      return null;
    }

    return reservation;
  }).filter(reservation => reservation !== null);  // Remove any nulls caused by exclusion

  // Step 4: Adjust end times to match the start time of the next event
  for (let i = 0; i < mergedReservations.length - 1; i++) {
    mergedReservations[i].endTime = mergedReservations[i + 1].startTime;
  }

  return mergedReservations;
}

// Function to fetch reservation data
async function fetchReservations(facility_id, reservationDate, court_id) {
  const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from yourcourts.com: ${error}`);
    return null;
  }
}

// Function to format and return the day’s reservations as a human-readable table
function formatReservationsAsTable(reservations) {
  let table = "┌─────────┬───────────┬────────────────────────────┬──────────┐\n";
  table += "│ (index) │ startTime │ status                     │ endTime  │\n";
  table += "├─────────┼───────────┼────────────────────────────┼──────────┤\n";

  reservations.forEach((reservation, index) => {
    table += `│ ${String(index).padEnd(9)} │ ${reservation.startTime.padEnd(10)} │ ${reservation.status.padEnd(25)} │ ${reservation.endTime.padEnd(10)} │\n`;
  });

  table += "└─────────┴───────────┴────────────────────────────┴──────────┘\n";
  return table;
}

app.get('/schedule', async (req, res) => {
  const { facility_id, reservationDate, court_id } = req.query;
  
  if (!facility_id || !reservationDate || !court_id) {
    return res.status(400).send("Missing required query parameters.");
  }

  // Fetch reservation data
  const data = await fetchReservations(facility_id, reservationDate, court_id);

  if (!data || !data.reservations) {
    return res.status(500).send("Error fetching reservation data.");
  }

  // Process the reservations according to the rules
  const processedReservations = cleanAndFormatReservations(data.reservations);

  // Format the reservations into a table for display
  const table = formatReservationsAsTable(processedReservations);

  // Send the table back as a response
  res.send(table);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
