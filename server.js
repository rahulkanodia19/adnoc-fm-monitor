// ============================================================
// server.js -- ADNOC FM Monitor Node.js Server
// Serves static files + proxies Claude API calls for sync
// Usage: node server.js (reads API key from .env)
// ============================================================

require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Rate limiting
let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 60000;

// Claude API sync endpoint
app.post('/api/sync', async (req, res) => {
  // Rate limit check
  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN_MS) {
    const remaining = Math.ceil((SYNC_COOLDOWN_MS - (now - lastSyncTime)) / 1000);
    return res.status(429).json({
      error: `Rate limited. Please wait ${remaining} seconds.`
    });
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY environment variable not set'
    });
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

    lastSyncTime = Date.now();

    // Extract JSON from response
    const responseText = message.content[0].text;
    let data;
    try {
      // Try parsing directly
      data = JSON.parse(responseText);
    } catch {
      // Try extracting from markdown code block
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
    res.status(500).json({
      error: 'Sync failed: ' + err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`ADNOC FM Monitor server running on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY not set. Sync will not work.');
    console.warn('Run with: ANTHROPIC_API_KEY=sk-... node server.js');
  }
});
