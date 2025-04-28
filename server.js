// server.js
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Make sure you install this
const app = express();

app.use(cors()); // Allow all origins

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const response = await fetch(targetUrl);
    const body = await response.text();
    res.send(body);
  } catch (err) {
    res.status(500).send('Error fetching target URL');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));