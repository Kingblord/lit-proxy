export default async function handler(req, res) {
  // === IMPROVED CORS HEADERS ===
  res.setHeader('Access-Control-Allow-Origin', '*');        // Allow all domains
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { target } = req.query;

  if (!target) {
    return res.status(400).json({ error: "Missing target parameter" });
  }

  try {
    let fetchUrl = target;

    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    };

    // For POST requests (SMMWiz)
    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(fetchUrl, fetchOptions);
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Return the same status and data
    res.status(response.status).send(data);

  } catch (error) {
    console.error("Proxy Error:", error);
    res.status(500).json({ 
      error: "Proxy failed", 
      message: error.message 
    });
  }
}