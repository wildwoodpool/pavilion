const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// Define the /proxy route
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    const reservationDate = req.query.reservationDate; // Extract the reservation date from the query

    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        // If a reservationDate is provided, append it to the target URL
        let fullUrl = targetUrl;
        if (reservationDate) {
            fullUrl += `&reservationDate=${reservationDate}`;
        }

        const response = await fetch(fullUrl);

        if (!response.ok) {
            throw new Error(`Fetch failed with status: ${response.status}`);
        }

        const body = await response.text();
        
        // Load HTML into Cheerio
        const $ = cheerio.load(body);
        
        // Assuming your schedule is in a <table> with rows <tr>
        const rows = $('table tbody tr');  // Adjust if needed for your table structure
        
        const currentTime = new Date();
        let currentUser = null;
        let nextUser = null;
        let ongoingReservation = null;

        rows.each((index, row) => {
            const cells = $(row).find('td');
            const timeCell = $(cells[0]).text().trim(); // Assuming first cell is the time
            const userCell = $(cells[1]).text().trim(); // Assuming second cell is the user
            
            console.log(`Row ${index + 1}: Time - ${timeCell}, User - ${userCell}`); // Debugging log

            // If the time is "Not open" or similar, skip processing it
            if (userCell === "Not open") {
                return; // Skip processing
            }

            // Handle special cases for time/status
            if (userCell === "Not available for rental" || userCell === "Open") {
                currentUser = "Not currently reserved";
            } else if (userCell === "Setup time" || userCell === "Takedown time" || userCell === "Setup and takedown time") {
                currentUser = userCell; // User info for setup/takedown time
            } else if (userCell !== "Not open") {
                currentUser = userCell; // Set the current user if there's a valid reservation
            }

            // Parse the time and check against the current time
            const scheduleTime = parseScheduleTime(timeCell);
            if (scheduleTime && scheduleTime <= currentTime && !nextUser) {
                ongoingReservation = userCell; // Identify ongoing reservation
            } else if (scheduleTime && scheduleTime > currentTime && !nextUser) {
                nextUser = userCell; // The first user after the current time
            }
        });

        // If no current user found, adjust output
        if (!currentUser) {
            currentUser = "Not currently reserved"; // Default to "Not currently reserved" if no user found
        }

        res.json({ currentUser, nextUser });
    } catch (error) {
        console.error('Error fetching target URL:', error.message);
        res.status(500).send(`Error fetching target URL: ${error.message}`);
    }
});

// Helper function to parse time in "HH:MMAM/PM" format to a Date object
function parseScheduleTime(timeString) {
    const match = timeString.match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
    if (!match) return null; // Return null if the time format doesn't match

    let [ , hour, minute, period ] = match;

    hour = parseInt(hour);
    minute = parseInt(minute);

    if (period.toUpperCase() === "PM" && hour !== 12) {
        hour += 12;
    }
    if (period.toUpperCase() === "AM" && hour === 12) {
        hour = 0; // Midnight case
    }

    // Return a Date object representing the time (using today's date)
    const now = new Date();
    now.setHours(hour, minute, 0, 0);
    return now;
}

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
