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

// ensure these exist:
const IMAGES_DIR = path.join(process.cwd(), 'images');
await fs.mkdir(IMAGES_DIR, { recursive: true });

const STORY_DIR = path.join(process.cwd(), 'story');
await fs.mkdir(STORY_DIR, { recursive: true });

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
  console.log('Received request for story generation:', req.body);
  const words = req.body.words || [];
  try {
    const storyPrompt = `Write a first person surreal story using these key components: ${words.join(', ')}. Keep it under 100 words.`;

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
    console.log('Generated story:', story);
    if (story) return res.json({ story });
    res.status(500).json({ error: 'No story generated.' });
  } catch (e) {
    console.error('Error generating story:', e);
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
// Add placeholder black square before images are generated
app.post('/generate-images', async (req, res) => {
    console.log('Received request for image generation:', req.body);
    const { prompt, n = 3 } = req.body;

    try {
      // Update placeholder URL to point to the correct path
      const placeholderPath = `${req.protocol}://${req.get('host')}/public/asset/placeholder-black-512x512.png`;
      const placeholderUrls = Array(n).fill(placeholderPath);

      // Send placeholder URLs immediately
      res.json({ imageUrls: placeholderUrls });

      // Generate actual images asynchronously
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
        console.error('No images returned from OpenAI');
        return;
      }

      // Replace placeholder images with actual images
      const publicUrls = await Promise.all(aiData.data.map(async (item, index) => {
        const imageUrl = item.url;
        const imgResp = await fetch(imageUrl);
        const buffer = await imgResp.buffer();

        const filename = `ai-image-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
        const filepath = path.join(IMAGES_DIR, filename);
        await fs.writeFile(filepath, buffer);

        return `${req.protocol}://${req.get('host')}/images/${filename}`;
      }));

      console.log('Generated image URLs:', publicUrls);
    } catch (err) {
      console.error('❌ /generate-images error', err);
    }
});
  

// Gradual color transition logic
function interpolateColor(color1, color2, factor) {
  const hexToRgb = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };

  const rgbToHex = (rgb) => {
    return `#${rgb.map((val) => val.toString(16).padStart(2, '0')).join('')}`;
  };

  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const interpolatedRgb = rgb1.map((val, i) => Math.round(val + factor * (rgb2[i] - val)));
  return rgbToHex(interpolatedRgb);
}

let previousColor = '#FFFFFF'; // Default to white

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
        model: 'gpt-4',
        messages: [{ role: 'user', content: moodPrompt }],
        temperature: 0.7,
        max_tokens: 10
      }),
    });

    const aiData = await aiResp.json();
    const moodColor = aiData.choices?.[0]?.message?.content?.trim();

    if (!moodColor || !/^#[0-9A-Fa-f]{6}$/.test(moodColor)) {
      return res.status(500).json({ error: 'Failed to generate mood color' });
    }

    // Gradual transition logic
    const transitionSteps = 10;
    const transitionInterval = 100; // milliseconds

    for (let i = 0; i <= transitionSteps; i++) {
      setTimeout(() => {
        const intermediateColor = interpolateColor(previousColor, moodColor, i / transitionSteps);
        console.log(`Transition step ${i}: ${intermediateColor}`);
        if (i === transitionSteps) {
          previousColor = moodColor; // Update previous color after transition
          res.json({ color: moodColor });
        }
      }, i * transitionInterval);
    }
  } catch (err) {
    console.error('❌ /analyze-mood error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to save the story to the 'story' folder
app.post('/save-story', async (req, res) => {
  console.log('Request body:', req.body);
  const { fileName, content } = req.body;
  if (!fileName || !content) {
    return res.status(400).json({ error: 'Missing fileName or content in request body' });
  }

  console.log('Received request to save story:', { fileName, content });

  try {
    const filePath = path.join(STORY_DIR, fileName);
    await fs.writeFile(filePath, content, 'utf8');
    console.log('Story saved to:', filePath);

    res.status(200).json({ message: 'Story saved successfully' });
  } catch (err) {
    console.error('❌ Error saving story:', err);
    res.status(500).json({ error: 'Failed to save story' });
  }
});

// Serve front-end & saved images
app.use(express.static('public'));
app.use('/images', express.static(IMAGES_DIR));

// Serve the asset folder explicitly
app.use('/asset', express.static(path.join(process.cwd(), 'public/asset')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log('✅ Server running at http://localhost:' + PORT);
});
