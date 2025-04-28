const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors());

// Create a route for fetching and parsing the data
app.get('/proxy', async (req, res) => {
    try {
        // Ensure URL is passed and valid
        const targetUrl = req.query.url;
        if (!targetUrl) {
            return res.status(400).send('URL parameter is required');
        }

        // Make HTTP request to the target URL (Pavilion Rentals specific URL)
        const response = await axios.get(targetUrl);

        // Parse the HTML content with Cheerio
        const $ = cheerio.load(response.data);
        
        // Look for the table that contains the schedule data (may need adjustment based on actual HTML structure)
        const scheduleRows = $('.schedule-table').find('tr');

        const reservations = [];
        
        // Loop through each row and extract the schedule information
        scheduleRows.each((i, row) => {
            const time = $(row).find('td.time').text().trim();
            const user = $(row).find('td.user').text().trim();

            // Adjust logic here to match the content of your table
            if (time && user) {
                reservations.push({ time, user });
            }
        });

        // Process the reservations
        let currentUser = "Not currently reserved";
        let nextUser = "No upcoming reservation";

        // Get the date from the query params (or use the current date if not provided)
        const reservationDate = req.query.reservationDate ? new Date(req.query.reservationDate) : new Date();

        // Adjust time parsing and compare with the current date/time
        const currentTimeSlot = reservations.find((reservation) => {
            const reservationTime = new Date(reservationDate.toDateString() + ' ' + reservation.time);
            return reservationTime <= new Date() && reservationTime.getTime() > new Date().getTime() - 30 * 60 * 1000;
        });

        // Logic to display next user
        const nextTimeSlot = reservations.find((reservation) => {
            const reservationTime = new Date(reservationDate.toDateString() + ' ' + reservation.time);
            return reservationTime > new Date();
        });

        if (currentTimeSlot && currentTimeSlot.user !== "Not open") {
            currentUser = currentTimeSlot.user === "Open" ? "Not currently reserved" : currentTimeSlot.user;
        }

        if (nextTimeSlot) {
            nextUser = nextTimeSlot.user === "Open" ? "Not currently reserved" : nextTimeSlot.user;
        }

        // Send back the parsed results
        res.json({
            currentUser,
            nextUser
        });

    } catch (error) {
        console.error('Error fetching target URL:', error);
        res.status(500).send('Error fetching data');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
