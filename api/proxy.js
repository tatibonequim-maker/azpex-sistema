export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const SCRIPT_URL = process.env.APPS_SCRIPT_URL
  if (!SCRIPT_URL) return res.status(500).json({ error: 'APPS_SCRIPT_URL not set' })
  try {
    if (req.method === 'GET') {
      const action = req.query.action
      const response = await fetch(`${SCRIPT_URL}?action=${action}`)
      const data = await response.json()
      return res.status(200).json(data)
    }
    if (req.method === 'POST') {
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const data = await response.json()
      return res.status(200).json(data)
    }
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
