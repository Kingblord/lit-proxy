export default async function handler(req, res) {
        // 1. SET CORS HEADERS (The Fix!)
            // Replace the '*' with your actual hosted website URL (e.g., https://lit.co)
                res.setHeader('Access-Control-Allow-Origin', 'https://cloutiva-app.is-best.net');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'
                        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

                            // Handle the browser "Preflight" check
                                if (req.method === 'OPTIONS') {
                                        return res.status(200).end();
                                            }

                                                const { service } = req.query; // 'hero' or 'smm'

                                                    try {
                                                            if (service === 'hero') {
                                                                        const HERO_KEY = process.env.HERO_SMS_KEY;
                                                                                    const queryParams = new URLSearchParams({ ...req.query, api_key: HERO_KEY });
                                                                                                delete queryParams.delete('service'); // Remove 'service' from actual API call

                                                                                                            const response = await fetch(`https://hero-sms.com/stubs/handler_api.php?${queryParams}`);
                                                                                                                        const data = await response.text();
                                                                                                                                    return res.status(200).send(data);
                                                                                                                                            }

                                                                                                                                                    if (service === 'smm') {
                                                                                                                                                                const SMM_KEY = process.env.SMM_WIZ_KEY;
                                                                                                                                                                            const response = await fetch('https://smmwiz.com/api/v2', {
                                                                                                                                                                                            method: 'POST',
                                                                                                                                                                                                            headers: { 'Content-Type': 'application/json' },
                                                                                                                                                                                                                            body: JSON.stringify({ ...req.body, key: SMM_KEY })
                                                                                                                                                                                                                                        });
                                                                                                                                                                                                                                                    const data = await response.json();
                                                                                                                                                                                                                                                                return res.status(200).json(data);
                                                                                                                                                                                                                                                                        }

                                                                                                                                                                                                                                                                                res.status(400).json({ error: "Invalid service" });
                                                                                                                                                                                                                                                                                    } catch (error) {
                                                                                                                                                                                                                                                                                            res.status(500).json({ error: "Proxy Error", details: error.message });
                                                                                                                                                                                                                                                                                                }
                                                                                                                                                                                                                                                                                                }

}