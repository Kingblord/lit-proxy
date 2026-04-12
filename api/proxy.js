export default async function handler(req, res) {
    // ===================== CORS =====================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { service, ...otherParams } = req.query;

    try {

        // ===================== HERO SMS (GET ONLY) =====================
        if (service === 'hero') {
            const HERO_KEY = process.env.HERO_SMS_KEY;

            if (!HERO_KEY) {
                return res.status(500).json({ error: "Missing HERO_SMS_KEY" });
            }

            const cleanParams = Object.fromEntries(
                Object.entries(otherParams).filter(([_, v]) => v !== undefined)
            );

            const queryParams = new URLSearchParams({
                api_key: HERO_KEY,
                ...cleanParams
            }).toString();

            const response = await fetch(
                `https://hero-sms.com/stubs/handler_api.php?${queryParams}`
            );

            const data = await response.text();

            return res.status(200).send(data);
        }

        // ===================== SMM WIZ (GET + POST SUPPORT) =====================
        if (service === 'smm') {
            const SMM_KEY = process.env.SMM_WIZ_KEY;

            if (!SMM_KEY) {
                return res.status(500).json({ error: "Missing SMM_WIZ_KEY" });
            }

            let payload = {};

            // Handle GET requests (your frontend currently uses this)
            if (req.method === 'GET') {
                payload = {
                    ...otherParams,
                    key: SMM_KEY
                };
            }

            // Handle POST requests
            if (req.method === 'POST') {
                payload = {
                    ...(req.body || {}),
                    key: SMM_KEY
                };
            }

            const response = await fetch('https://smmwiz.com/api/v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            return res.status(200).json(data);
        }

        // ===================== INVALID SERVICE =====================
        return res.status(400).json({ error: "Invalid service requested" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy Error",
            details: error.message
        });
    }
}
