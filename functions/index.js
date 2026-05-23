const functions = require('firebase-functions/v1')

const INVITE_WEBHOOK_URL = 'https://n8n.yourwayai.pl/webhook/eduflow-invite'

exports.inviteProxyV1 = functions.region('us-central1').https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' })
    return
  }

  try {
    const response = await fetch(INVITE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    })

    const body = await response.text()
    if (!response.ok) {
      console.warn('Invite webhook returned non-OK status', { status: response.status, body })
    }

    res.status(200).json({
      success: true,
      accepted: true,
      upstreamStatus: response.status,
    })
  } catch (error) {
    console.error('Invite webhook proxy failed', error)
    res.status(200).json({ success: true, accepted: true, upstreamStatus: 0 })
  }
})