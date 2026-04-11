export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { target } = req.query;

  if (!target) {
    return res.status(400).json({ error: "Missing 'target' parameter" });
  }

  try {
    let url = target;

    // For Hero SMS (GET requests)
    if (req.method === 'GET') {
      const response = await fetch(url);
      const text = await response.text();
      return res.status(response.status).send(text);
    }

    // For SMMWiz (POST requests)
    if (req.method === 'POST') {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });

      const data = await response.json().catch(() => response.text());
      return res.status(response.status).json(data);
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Proxy error", message: error.message });
  }
}