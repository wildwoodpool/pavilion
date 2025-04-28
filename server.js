import express from 'express';
import axios from 'axios';
import cheerio from 'cheerio';
import dayjs from 'dayjs';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';

const app = express();
const port = process.env.PORT || 3000;

// Function to fetch reservation data
const fetchReservationData = async (reservationDate, facility_id, court_id) => {
  try {
    const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
    const response = await fetch(url);
    const body = await response.text();
    const $ = cheerio.load(body);

    // Assuming the table with the reservations has specific rows with the relevant data
    const reservations = [];
    
    $('tr').each((index, element) => {
      const startTime = $(element).find('.start-time-selector').text().trim(); // Adjust the selector based on actual HTML structure
      const status = $(element).find('.status-selector').text().trim(); // Adjust the selector based on actual HTML structure
      const endTime = $(element).find('.end-time-selector').text().trim(); // Adjust the selector based on actual HTML structure

      if (startTime && status && endTime) {
        reservations.push({
          startTime,
          status,
          endTime
        });
      }
    });

    return reservations;
  } catch (error) {
    console.error('Error fetching data from yourcourts.com:', error);
    return [];
  }
};

// Function to format the reservations, ignoring empty ones and applying all the rules
const formatReservations = (reservations) => {
  let formattedReservations = [];
  let currentReservation = null;

  for (let i = 0; i < reservations.length; i++) {
    const { startTime, status, endTime } = reservations[i];

    // Skip empty events
    if (status === 'Open' || status.includes('Setup and takedown time') || status === 'Not available for rental') {
      continue;
    }

    // Handle merging of back-to-back reservations
    if (currentReservation && currentReservation.status === status) {
      currentReservation.endTime = endTime;
    } else {
      if (currentReservation) {
        formattedReservations.push(currentReservation);
      }
      currentReservation = { startTime, status, endTime };
    }
  }

  // Add the last reservation if present
  if (currentReservation) {
    formattedReservations.push(currentReservation);
  }

  return formattedReservations;
};

// API to fetch and process reservation data
app.get('/proxy', async (req, res) => {
  const reservationDate = req.query.reservationDate || dayjs().format('MM/DD/YYYY'); // Default to today
  const facility_id = req.query.facility_id;
  const court_id = req.query.court_id;

  if (!facility_id || !court_id) {
    return res.status(400).json({ error: 'Facility ID and Court ID are required' });
  }

  const reservations = await fetchReservationData(reservationDate, facility_id, court_id);
  const formattedReservations = formatReservations(reservations);

  // Log the reservations as a table
  console.table(formattedReservations);

  // Send the formatted reservations as JSON response
  res.json(formattedReservations);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
