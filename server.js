const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
app.use(cors());

// Define the /proxy route
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;

    if (!targetUrl) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        const response = await fetch(targetUrl);

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

        rows.each((index, row) => {
            const cells = $(row).find('td');
            const timeCell = $(cells[0]).text().trim(); // Assuming first cell is the time
            const userCell = $(cells[1]).text().trim(); // Assuming second cell is the user
            
            // Convert the time in the table to a Date object
            const scheduleTime = new Date(`1970-01-01T${timeCell}:00Z`); // Adjust as necessary
            
            if (scheduleTime <= currentTime && !currentUser) {
                currentUser = userCell; // The first user that matches or is before the current time
            } else if (scheduleTime > currentTime && !nextUser) {
                nextUser = userCell; // The first user after the current time
            }
        });

        res.json({ currentUser, nextUser });
    } catch (error) {
        console.error('Error fetching target URL:', error.message);
        res.status(500).send(`Error fetching target URL: ${error.message}`);
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
