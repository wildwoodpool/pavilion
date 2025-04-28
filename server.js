const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

// Proxy route to forward the request
app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    // Log query parameters for debugging
    console.log(`Received Query Parameters: ${JSON.stringify(req.query)}`);

    // Validate facility_id and court_id to ensure we are targeting the right facility
    if (facility_id !== '2103') {
        return res.status(400).json({ error: 'Invalid facility ID. Expected Pavilion ID.' });
    }

    if (court_id !== '15094') {
        return res.status(400).json({ error: 'Invalid court ID. Expected Pavilion Court.' });
    }

    try {
        console.log(`Making request to yourcourts.com with reservationDate: ${reservationDate}, facility_id: ${facility_id}, court_id: ${court_id}`);

        // Make the request to the yourcourts.com URL and retrieve the HTML response
        const response = await axios.get('https://www.yourcourts.com/facility/viewer/8353821', {
            params: {
                reservationDate: reservationDate,
                facility_id: facility_id,
                court_id: court_id
            }
        });

        // If the response contains HTML, parse it using cheerio
        const $ = cheerio.load(response.data);

        // You need to adjust this based on the structure of the HTML page
        let reservations = [];

        // For the sake of the example, assuming reservation data is inside a table
        // Update this selector based on your actual HTML structure
        $('table.reservation-table tr').each((index, element) => {
            const time = $(element).find('.time').text().trim();
            const username = $(element).find('.username').text().trim();
            const nextUser = $(element).find('.next-user').text().trim();

            // Process each reservation (you may need to tweak this)
            if (time !== 'Not open') {
                let currentUser = '';

                if (time === 'Not available for rental' || time === 'Open') {
                    currentUser = 'Not currently reserved';
                } else if (['Setup time', 'Takedown time', 'Setup and takedown time'].includes(time)) {
                    currentUser = username === 'Open' ? 'Not currently reserved' : username;
                }

                reservations.push({
                    time: time,
                    currentUser: currentUser,
                    nextUser: nextUser || 'No upcoming reservation'
                });
            }
        });

        console.log('Processed Reservations:', JSON.stringify(reservations));

        // Return the processed data as JSON
        res.json(reservations);

    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        res.status(500).json({ error: 'Failed to fetch or parse data from yourcourts.com' });
    }
});

// Start the server on the appropriate port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
