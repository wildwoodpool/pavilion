const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');  // Using node-fetch v2

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
        res.send(body);
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
