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
                            reference,
                            amount,
                            currency: "NGN",
                            provider: "kora",
                            status: "success",
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        // ================= CREDIT USER WALLET =================
                        const userRef = db.collection("users").doc(userUid);

                        await userRef.set({
                            balance: admin.firestore.FieldValue.increment(amount)
                        }, { merge: true });

                        console.log("✅ User credited:", userUid);

                    } catch (err) {
                        console.error("Firebase error:", err);
                    }
                }

                return res.status(200).json({ status: "ok" });
            }

            // ===================== INIT (SDK MODE - SAFE RESPONSE) =====================
            if (req.method === 'POST' && action === 'initialize') {

                const { amount, reference, customer } = body;

                if (!amount || !reference) {
                    return res.status(400).json({ error: "Missing fields" });
                }

                // We DO NOT create payment here (SDK handles it)
                return res.status(200).json({
                    status: true,
                    data: {
                        reference,
                        amount
                    }
                });
            }

            return res.status(400).json({ error: "Invalid Kora request" });
        }

        return res.status(400).json({ error: "Invalid provider" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy failure",
            details: error.message
        });
    }
}            }

            // ===================== INITIALIZE PAYMENT (From Frontend) =====================
            if (req.method === 'POST' && req.query.action === 'initialize') {
                if (!KORA_PUBLIC_KEY) {
                    return res.status(500).json({ error: "Missing Public Key" });
                }

                const { amount, reference, customer, redirect_url } = req.body;

                if (!amount || !reference) {
                    return res.status(400).json({ error: "Amount and reference are required" });
                }

                const payload = {
                    key: KORA_PUBLIC_KEY,           // Public key for checkout
                    reference: reference,
                    amount: parseFloat(amount),
                    currency: "NGN",
                    customer: customer || {
                        name: "Cloutiva User",
                        email: "user@cloutivaapp.shop"
                    },
                    notification_url: "https://lit-proxy.vercel.app/api/proxy?provider=kora", // Your webhook
                    redirect_url: redirect_url || window.location.origin + "/dashboard.html"
                };

                // Using client-side initialize style via proxy
                return res.status(200).json({
                    status: true,
                    message: "Payment initialized",
                    data: {
                        checkout_url: null, // Will be handled by Korapay JS on frontend
                        reference: reference
                    }
                });
            }

            return res.status(400).json({ error: "Invalid Kora action" });
        }

        return res.status(400).json({ error: "Invalid service requested" });

    } catch (error) {
        console.error("Proxy Error:", error);
        return res.status(500).json({
            error: "Proxy Error",
            details: error.message
        });
    }
}
