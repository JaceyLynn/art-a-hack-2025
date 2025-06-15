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

// 1) Ensure images/ exists
const IMAGES_DIR = path.join(process.cwd(), 'images');
await fs.mkdir(IMAGES_DIR, { recursive: true });

// 2) Serve front-end & saved images
app.use(express.static('public'));
app.use('/images', express.static(IMAGES_DIR));

//🌟⚠️PUT YOUR OWN API KEY
const API_KEY = '';

// 3) A simple root route
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// 🌙 Generate story
app.post('/generate-story', async (req, res) => {
  const words = req.body.words || [];
  try {
    const storyPrompt = `Write a short, poetic dream-like story based on these words: ${words.join(', ')}. Keep it under 80 words.`;
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

// 🖼️ Generate image, save to disk, return its URL
app.post('/generate-image', async (req, res) => {
  const prompt = req.body.prompt;
  try {
    // Request DALL·E
    const genResp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, n: 1, size: '512x512' })
    });
    const genData = await genResp.json();
    const imageUrl = genData.data?.[0]?.url;
    if (!imageUrl) {
      return res.status(500).json({ error: 'Image URL not returned' });
    }

    // Download the image bytes
    const imgResp = await fetch(imageUrl);
    const buffer = await imgResp.buffer();

    // Save to images/
    const filename = `ai-image-${Date.now()}.png`;
    const filepath = path.join(IMAGES_DIR, filename);
    await fs.writeFile(filepath, buffer);

    // Return the public URL
    const publicUrl = `${req.protocol}://${req.get('host')}/images/${filename}`;
    res.json({ url: publicUrl });
  } catch (err) {
    console.error('Error generating image:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => {
  console.log('✅ Server running at http://localhost:3000');
});
