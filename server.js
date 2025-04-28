const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

// Define the route to fetch reservations
app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate || !facility_id || !court_id) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        // Correct URL format (facility_id in the query string)
        const url = `https://www.yourcourts.com/facility/viewer/8353821?facility_id=${facility_id}?reservationDate=${reservationDate}&court_id=${court_id}`;
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        const response = await axios.get(url);
        const html = response.data;

        console.log('Formatted HTML content received (first 2000 chars):');
        console.log(html.slice(0, 2000)); // Log first 2000 chars to check if data is valid

        const processedReservations = processReservations(html);

        // Add debug log to check raw reservation data after processing
        console.log('Processed Reservations:', processedReservations);

        if (processedReservations.length === 0) {
            return res.json({ message: 'No reservations today.' });
        }

        // Find the current and next reservations
        const currentReservation = processedReservations[0]; // First reservation of the day
        const nextReservation = processedReservations[1] || { time: 'No more reservations today' };

        // Format the reservation response
        const responseData = {
            currentUser: `${currentReservation.startTime} - ${currentReservation.endTime} ${currentReservation.status}`,
            nextUser: nextReservation.time !== 'No more reservations today'
                ? `${nextReservation.startTime} - ${nextReservation.endTime} ${nextReservation.status}`
                : 'No more reservations today',
        };

        return res.json(responseData);
    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        return res.status(500).json({ error: 'Error fetching data from yourcourts.com' });
    }
});

// Function to process reservations from the HTML response
function processReservations(html) {
    const $ = cheerio.load(html);
    const reservations = [];
    let currentReservation = {};

    $('tr').each((index, element) => {
        const time = $(element).find('td.court-time').text().trim();
        const status = $(element).find('td').last().text().trim();
        const color = $(element).find('td').last().attr('style').match(/background-color:([^;]+)/)?.[1] || '';

        if (time && status) {
            if (status.includes('Member Event')) {
                // Remove "Member Event" but keep the name
                const statusWithoutMemberEvent = status.replace('Member Event', '').trim();
                currentReservation = {
                    time,
                    status: statusWithoutMemberEvent,
                    color,
                };
            } else {
                currentReservation = {
                    time,
                    status,
                    color,
                };
            }
        }

        reservations.push(currentReservation);
    });

    // Group back-to-back reservations with the same status into a single reservation
    const groupedReservations = groupBackToBackReservations(reservations);

    // Add additional rules for handling start/end time for current and next user
    return groupedReservations;
}

// Function to group back-to-back reservations
function groupBackToBackReservations(reservations) {
    let grouped = [];
    let currentGroup = null;

    reservations.forEach((reservation, index) => {
        if (!currentGroup || currentGroup.status !== reservation.status) {
            if (currentGroup) grouped.push(currentGroup);
            currentGroup = { ...reservation, startTime: reservation.time, endTime: reservation.time };
        } else {
            currentGroup.endTime = reservation.time;
        }

        if (index === reservations.length - 1) {
            grouped.push(currentGroup);
        }
    });

    return grouped;
}

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
