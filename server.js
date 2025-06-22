import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ensure this exists:
const IMAGES_DIR = path.join(process.cwd(), 'images');
await fs.mkdir(IMAGES_DIR, { recursive: true });


// 2) Serve front-end & saved images
app.use(express.static('public'));
app.use('/images', express.static(IMAGES_DIR));

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

// 3) A simple root route
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// 🌙 Generate story
app.post('/generate-story', async (req, res) => {
  const words = req.body.words || [];
  try {
    const storyPrompt = `Write a dream-like first person story based on these components: ${words.join(', ')}. Keep it under 100 words.`;

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: storyPrompt }]
      }),
    });
    const aiData = await aiResp.json();
    const story = aiData.choices?.[0]?.message?.content;
    if (story) return res.json({ story });
    res.status(500).json({ error: 'No story generated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'OpenAI error.' });
  }
});

// 🌄 Generate a DALL·E-style prompt from the story
app.post('/generate-image-prompt', async (req, res) => {
  const { story } = req.body;
  if (!story) {
    return res.status(400).json({ error: 'Missing story in request body' });
  }

  try {
    // Ask GPT to turn the story into a concise, vivid image prompt
    const promptResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system',
            content: `You are an assistant that turns short stories into vivid DALL·E prompts.  
                      Always write it in a dreamy way, and make images in a lowfi style`.replace(/\s+/g,' ')
          },
          { role: 'user', content: story }
        ],
        temperature: 0.8,
        max_tokens: 60
      })
    });
    const promptData = await promptResp.json();

    // Forward any OpenAI error
    if (promptData.error) {
      console.error('OpenAI image-prompt error:', promptData.error);
      return res.status(502).json({ error: promptData.error.message });
    }

    const imagePrompt = promptData.choices?.[0]?.message?.content?.trim();
    if (!imagePrompt) {
      return res.status(500).json({ error: 'Failed to generate image prompt' });
    }

    res.json({ imagePrompt });
  } catch (err) {
    console.error('❌ /generate-image-prompt error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /generate-images → generate n images, save each to disk, return their public URLs
app.post('/generate-images', async (req, res) => {
    const { prompt, n = 3 } = req.body;
  
    try {
      // 1) Ask OpenAI for n images
      const aiResp = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ prompt, n, size: '512x512' })
      });
      const aiData = await aiResp.json();
      if (!aiData.data || !Array.isArray(aiData.data)) {
        return res.status(500).json({ error: 'No images returned from OpenAI' });
      }
  
      // 2) Download & save each image
      const publicUrls = await Promise.all(aiData.data.map(async (item) => {
        const imageUrl = item.url;
        const imgResp = await fetch(imageUrl);
        const buffer = await imgResp.buffer();
  
        const filename = `ai-image-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
        const filepath = path.join(IMAGES_DIR, filename);
        await fs.writeFile(filepath, buffer);
  
        return `${req.protocol}://${req.get('host')}/images/${filename}`;
      }));
  
      // 3) Send back the array of URLs
      res.json({ imageUrls: publicUrls });
  
    } catch (err) {
      console.error('❌ /generate-images error', err);
      res.status(500).json({ error: err.message });
    }
  });
  

// 🌈 Analyze mood and return a color
app.post('/analyze-mood', async (req, res) => {
  const { story } = req.body;
  if (!story) {
    return res.status(400).json({ error: 'Missing story in request body' });
  }

  try {
    const moodPrompt = `Analyze the mood of the following story and return ONLY the single hex color code that best represents the mood: ${story}`;

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4', // Updated to use gpt-4
        messages: [{ role: 'user', content: moodPrompt }],
        temperature: 0.7,
        max_tokens: 10
      }),
    });

    const aiData = await aiResp.json();
    const moodColor = aiData.choices?.[0]?.message?.content?.trim();
    console.log('Generated mood color:', moodColor); // Log the generated mood color

    if (!moodColor || !/^#[0-9A-Fa-f]{6}$/.test(moodColor)) {
      return res.status(500).json({ error: 'Failed to generate mood color' });
    }

    res.json({ color: moodColor });
  } catch (err) {
    console.error('❌ /analyze-mood error:', err);
    res.status(500).json({ error: err.message });
  }
});


app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
