const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');

const app = express();

// Endpoint to fetch reservations data
app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    try {
        const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}&reservationDate=${reservationDate}&court_id=${court_id}`;
        console.log(`Fetching data from ${url}`);

        const response = await axios.get(url);

        // Parse the HTML response
        const reservations = processReservations(response.data);

        if (reservations.length === 0) {
            res.json({ message: "No reservations today." });
        } else {
            console.table(reservations);
            res.json(reservations);
        }
    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        res.status(500).json({ error: 'Failed to fetch data from yourcourts.com' });
    }
});

// Process the reservations and return a list of reservations
function processReservations(html) {
    const $ = cheerio.load(html);
    const reservations = [];
    let currentReservation = null;

    // Get the current time in Eastern Time (adjusted for DST)
    const currentTime = moment().tz('America/New_York');

    // Parse all reservation times and statuses
    $('tr').each((index, element) => {
        const time = $(element).find('td.court-time').text().trim();
        const status = $(element).find('td').last().text().trim();

        if (time && status) {
            // Clean status: remove "Member Event" or other irrelevant text
            let cleanStatus = status.includes('Member Event') 
                ? status.replace('Member Event', '').trim() 
                : status;

            // Filter out "Not available for rental" and other unavailable statuses
            if (cleanStatus !== 'Not available for rental' && cleanStatus !== 'Not open') {
                // Convert reservation time to moment object in Eastern Time
                const reservationTime = moment.tz(`${time} ${currentTime.format('YYYY-MM-DD')}`, 'h:mma', 'America/New_York');

                // Add the reservation to the list if it's after the current time
                if (reservationTime.isAfter(currentTime)) {
                    currentReservation = {
                        startTime: reservationTime.format('h:mma'),
                        status: cleanStatus,
                    };
                    reservations.push(currentReservation);
                }
            }
        }
    });

    // Group back-to-back reservations with the same status into a single reservation
    const groupedReservations = groupBackToBackReservations(reservations);

    return groupedReservations;
}

// Helper function to group back-to-back reservations with the same status
function groupBackToBackReservations(reservations) {
    const grouped = [];
    let lastReservation = null;

    reservations.forEach(reservation => {
        if (lastReservation && lastReservation.status === reservation.status) {
            // If status is the same, merge reservations by combining the times
            lastReservation.endTime = reservation.startTime; // Update end time
        } else {
            // Otherwise, add the current reservation to the grouped list
            reservation.endTime = reservation.startTime; // Set end time to start time if it's a single reservation
            grouped.push(reservation);
            lastReservation = reservation;
        }
    });

    // Set the end times for merged reservations
    grouped.forEach((reservation, index) => {
        if (index < grouped.length - 1 && reservation.status === grouped[index + 1].status) {
            reservation.endTime = grouped[index + 1].startTime;
        }
    });

    return grouped;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
