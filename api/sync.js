const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are an intelligence analyst monitoring the Strait of Hormuz / Gulf military escalation crisis (Feb-Mar 2026). Your task is to search for and compile the latest force majeure declarations, oil & gas shutdowns, and geopolitical events affecting energy infrastructure in the Middle East region.

Focus on:
- New force majeure declarations by energy/shipping companies
- Oil & gas facility shutdowns, attacks, or disruptions
- Country-level status changes (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel)
- Production volume impacts and infrastructure damage
- Shipping disruptions through Strait of Hormuz

Return your findings as JSON matching this exact schema:
{
  "countryStatus": [
    {
      "id": "string",
      "country": "string",
      "flag": "emoji",
      "status": "stable|elevated|high|critical|conflict",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "metrics": { "headline": "string", "productionOffline": "string", "keyFigure": "string" },
      "events": [{ "date": "YYYY-MM-DD", "title": "string", "description": "string", "isNew": boolean }],
      "oilGasImpact": { "severity": "none|low|moderate|severe|critical", "summary": "string", "details": "string" },
      "infrastructure": [{ "name": "string", "type": "string", "capacity": "string", "status": "operational|partial|shutdown" }],
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ],
  "fmDeclarations": [
    {
      "id": "string",
      "company": "string",
      "country": "string",
      "flag": "emoji",
      "date": "YYYY-MM-DD",
      "status": "active|partially_lifted|lifted",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "details": { "volumeAffected": "string", "commodity": "string", "duration": "string", "reason": "string", "financialImpact": "string" },
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ],
  "shutdowns": [
    {
      "id": "string",
      "company": "string",
      "country": "string",
      "flag": "emoji",
      "date": "YYYY-MM-DD",
      "status": "shutdown|struck|ongoing|halted|suspended|resumed",
      "statusLabel": "string",
      "isNew": boolean,
      "summary": "string",
      "details": { "volumeAffected": "string", "commodity": "string", "duration": "string", "reason": "string", "financialImpact": "string" },
      "sources": [{ "id": number, "title": "string", "url": "string", "date": "YYYY-MM-DD" }]
    }
  ]
}

Mark items as isNew: true if they occurred in the last 48 hours.
Include verified sources with real URLs where possible.
Return ONLY valid JSON, no additional text.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Search for the latest updates on the Gulf/Hormuz crisis as of ${new Date().toISOString().split('T')[0]}. Look for any new force majeure declarations, facility attacks, production shutdowns, or status changes since the last update. Compile comprehensive data for all 8 monitored countries (Qatar, Kuwait, Saudi Arabia, UAE, Iraq, Bahrain, Oman, Israel). Return the data as JSON.`
        }
      ]
    });

    const responseText = message.content[0].text;
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[1].trim());
      } else {
        throw new Error('Could not parse JSON from Claude response');
      }
    }

    res.json(data);
  } catch (err) {
    console.error('Sync API error:', err.message);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
};
