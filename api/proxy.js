export default async function handler(req, res) {
    // 1. SET CORS HEADERS
    // This allows your hosted site at is-best.net to communicate with this proxy
    res.setHeader('Access-Control-Allow-Origin', 'https://cloutiva-app.is-best.net');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle the browser "Preflight" check
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Extract the service and all other query parameters
    const { service, ...otherParams } = req.query;

    try {
        // ===================== HERO SMS (GET) =====================
        if (service === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;
            
            // Build the query string using otherParams (excluding 'service')
            const queryParams = new URLSearchParams({ 
                api_key: HERO_KEY,
                ...otherParams 
            }).toString();

            const response = await fetch(`https://hero-sms.com/stubs/handler_api.php?${queryParams}`);
            const data = await response.text();
            
            return res.status(200).send(data);
        }

        // ===================== SMM WIZ (POST) =====================
        if (service === 'smm') {
            const SMM_KEY = process.env.SMM_WIZ_KEY;
            
            const response = await fetch('https://smmwiz.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    ...req.body, 
                    key: SMM_KEY 
                })
            });
            
            const data = await response.json();
            return res.status(200).json(data);
        }

        // If neither service matches
        res.status(400).json({ error: "Invalid service requested" });

    } catch (error) {
        console.error("Proxy Error:", error);
        res.status(500).json({ error: "Proxy Error", details: error.message });
    }
}
