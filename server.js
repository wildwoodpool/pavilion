const express = require('express');
const axios = require('axios');
const app = express();

// Proxy route to forward the request
app.get('/proxy', async (req, res) => {
    // Extract parameters from query string
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
        // Sending request to the actual schedule page on yourcourts.com
        const response = await axios.get('https://www.yourcourts.com/facility/viewer/8353821', {
            params: {
                reservationDate: reservationDate,
                facility_id: facility_id,
                court_id: court_id
            }
        });

        // Send the retrieved data back to the frontend
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching data from yourcourts.com:', error);
        res.status(500).json({ error: 'Failed to fetch target URL' });
    }
});

// Start the server on the appropriate port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
