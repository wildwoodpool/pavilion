const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
    const { reservationDate, facility_id, court_id } = req.query;

    // Log the query parameters to verify the correct IDs are being passed
    console.log(`Reservation Date: ${reservationDate}`);
    console.log(`Facility ID: ${facility_id}`);
    console.log(`Court ID: ${court_id}`);

    // Check that the facility_id is correct (pavilion in this case)
    if (facility_id !== '2103') {
        return res.status(400).json({ error: 'Invalid facility ID. Expected Pavilion ID.' });
    }

    // Check that the court_id is correct (15094 for the pavilion court)
    if (court_id !== '15094') {
        return res.status(400).json({ error: 'Invalid court ID. Expected Pavilion Court.' });
    }

    try {
        // Send a request to the actual schedule page with the correct parameters
        const response = await axios.get(`https://www.yourcourts.com/facility/viewer/8353821`, {
            params: {
                reservationDate: reservationDate,
                facility_id: facility_id,
                court_id: court_id
            }
        });

        // Return the data from the schedule page back to the frontend
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching target URL:', error);
        res.status(500).json({ error: 'Failed to fetch target URL' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});