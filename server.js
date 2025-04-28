const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

// Helper function to process the raw data into the required format
const processReservations = (html) => {
    const $ = cheerio.load(html);
    const reservations = [];

    $('tr').each((i, element) => {
        const time = $(element).find('.court-time').text().trim();
        const status = $(element).find('td').last().text().trim();
        const color = $(element).find('td').last().css('background-color');

        if (time && status && color) {
            // Clean up the status to remove "Member Event" text
            const cleanedStatus = status.includes('Member Event')
                ? status.replace('Member Event', '').trim()
                : status;

            reservations.push({
                time,
                status: cleanedStatus,
                color,
            });
        }
    });

    // Group back-to-back reservations with the same status
    const groupedReservations = [];
    let currentGroup = null;

    reservations.forEach((reservation) => {
        if (currentGroup && currentGroup.status === reservation.status) {
            // Merge back-to-back reservations with the same status
            currentGroup.endTime = reservation.time;
        } else {
            if (currentGroup) groupedReservations.push(currentGroup);
            currentGroup = { ...reservation, startTime: reservation.time, endTime: reservation.time };
        }
    });

    if (currentGroup) groupedReservations.push(currentGroup);

    return groupedReservations;
};

// Define the route to fetch reservations
app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    if (!reservationDate || !facility_id || !court_id) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    try {
        const url = `https://www.yourcourts.com/facility/viewer/${facility_id}?reservationDate=${reservationDate}&court_id=${court_id}`;
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        const response = await axios.get(url);
        const html = response.data;

        console.log('Formatted HTML content received (first 2000 chars):');
        console.log(html.slice(0, 2000)); // Just log the first 2000 characters for brevity

        const processedReservations = processReservations(html);
        console.log('Processed Reservations:', processedReservations);

        // Check if there are any reservations
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

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
