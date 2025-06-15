async function generate() {
  const w1 = document.getElementById('word1').value.trim();
  const w2 = document.getElementById('word2').value.trim();
  const w3 = document.getElementById('word3').value.trim();
  if (!w1 || !w2 || !w3) {
    return alert('Please enter all 3 words!');
  }

  try {
    // 1) Generate the story
    const storyRes = await fetch('/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: [w1, w2, w3] })
    });
    const { story } = await storyRes.json();
    document.getElementById('image-story').innerText = story || 'No story generated.';

   // 3) Create an image prompt from the story
   const promptRes = await fetch('/generate-image-prompt', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ story })
  });
  if (!promptRes.ok) {
    const err = await promptRes.text();
    console.error('Image-prompt failure:', err);
    return alert('Failed to generate image prompt');
  }
  const { imagePrompt } = await promptRes.json();
  

  // 4) Generate & render 3 images from that prompt
  const styledPrompt = `${imagePrompt.trim()}, in a surrealist style reminiscent of Salvador Dalí or René Magritte`;
  const imagesRes = await fetch('/generate-images', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ prompt: styledPrompt, n: 3 })
  });
  if (!imagesRes.ok) {
    const err = await imagesRes.text();
    console.error('Image generation failure:', err);
    return alert('Image generation failed');
  }
  const { imageUrls } = await imagesRes.json();

    // 3) Render into fixed slots
    document.getElementById('dreamImage1').src = imageUrls[0];
    document.getElementById('dreamImage2').src = imageUrls[1];
    document.getElementById('dreamImage3').src = imageUrls[2];

  } catch (err) {
    console.error('Error in generate():', err);
    alert('Something went wrong. Check console.');
  }
}
