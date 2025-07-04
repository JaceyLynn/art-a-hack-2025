console.log('Script loaded successfully');

async function generate() {
  console.log('Generate function triggered');
  const w1 = document.getElementById('word1').value.trim();
  const w2 = document.getElementById('word2').value.trim();
  const w3 = document.getElementById('word3').value.trim();
  if (!w1 || !w2 || !w3) {
    return alert('Please enter all 3 words!');
  }

  try {
    updateStatus('Generating story...');
    console.log('Fetching story from server');
    // Generate the story
    const storyRes = await fetch('/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: [w1, w2, w3] })
    });

    if (!storyRes.ok) {
      throw new Error(`Server error: ${storyRes.status} ${storyRes.statusText}`);
    }

    const storyData = await storyRes.json();
    const story = storyData.story;
    console.log('Received story data:', storyData);

    if (!story) {
      throw new Error('No story generated.');
    }
    document.getElementById('image-story').innerText = story;

    // Trigger download of the story as a .txt file
    const storyFileName = `generated-story-${Date.now()}.txt`;
    const blob = new Blob([story], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = storyFileName;
    link.click();
    console.log('Story download triggered:', storyFileName);

    // Re-enable dynamic background color update based on moodColor
    const moodRes = await fetch('/analyze-mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story })
    });

    if (!moodRes.ok) {
      const err = await moodRes.text();
      console.error('Mood analysis failure:', err);
      throw new Error('Failed to analyze mood');
    }

    const moodData = await moodRes.json();
    const moodColor = moodData.color;
    console.log('Applying mood color to background:', moodColor); // Log the mood color being applied
    document.body.style.backgroundColor = moodColor;

    // 3) Create an image prompt from the story
    const promptRes = await fetch('/generate-image-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story })
    });

    if (!promptRes.ok) {
      const err = await promptRes.text();
      console.error('Image-prompt failure:', err);
      throw new Error('Failed to generate image prompt');
    }

    const promptData = await promptRes.json();
    const imagePrompt = promptData.imagePrompt;

    // 4) Generate & render 3 images from that prompt
    const styledPrompt = `${imagePrompt.trim()}, in a surrealist style reminiscent of Salvador Dalí or René Magritte`;
    const imagesRes = await fetch('/generate-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: styledPrompt, n: 3 })
    });

    if (!imagesRes.ok) {
      const err = await imagesRes.text();
      console.error('Image generation failure:', err);
      throw new Error('Failed to generate images');
    }

    const imagesData = await imagesRes.json();
    const imageUrls = imagesData.imageUrls;
    console.log('Generated image URLs:', imageUrls); // Log the generated image URLs

    // Render images
    const imageContainer = document.getElementById('image-container');
    imageContainer.innerHTML = '';
    imageUrls.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.onload = () => console.log(`Image loaded successfully: ${url}`); // Log successful image load
      img.onerror = () => console.error(`Failed to load image: ${url}`); // Log image load failure
      imageContainer.appendChild(img);
    });

    updateStatus('Generation complete!');
  } catch (error) {
    updateStatus('Generation failed. Try again.');
    console.error('Error in generate():', error);
    alert(error.message);
  }
}


