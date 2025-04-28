const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/check-reservation', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    console.log(`Received Query Parameters: ${JSON.stringify(req.query)}`);
    try {
        // Construct the URL based on user input
        const url = `https://www.yourcourts.com/facility/viewer/8353821?reservationDate=${reservationDate}&facility_id=${facility_id}&court_id=${court_id}`;
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        // Fetch the page content
        const response = await axios.get(url);

        // Load the HTML response into cheerio for parsing
        const $ = cheerio.load(response.data);

        // Initialize an array to store the reservations
        let reservations = [];

        // Loop through each table row that contains court time info
        $('tr').each((i, row) => {
            const time = $(row).find('.court-time').text().trim(); // Extract the time (e.g., '10:30AM')

            // Skip rows without time or with irrelevant data
            if (!time) return;

            const availabilityText = $(row).find('td').last().text().trim(); // Get the availability text

            // Check if the court is reserved or not
            if (availabilityText && availabilityText.toLowerCase().includes('not available')) {
                reservations.push({
                    time,
                    status: 'Not available',
                });
            } else if (availabilityText && availabilityText.toLowerCase().includes('setup time')) {
                reservations.push({
                    time,
                    status: 'Setup time',
                });
            } else {
                reservations.push({
                    time,
                    status: 'Available for rental', // If no specific status is found, assume it's available
                });
            }
        });

        // Return the processed reservation data
        res.json({ reservations });
    } catch (error) {
        console.error("Error fetching data from yourcourts.com:", error);
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
