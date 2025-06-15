async function generate() {
  const w1 = document.getElementById('word1').value.trim();
  const w2 = document.getElementById('word2').value.trim();
  const w3 = document.getElementById('word3').value.trim();
  if (!w1 || !w2 || !w3) {
    return alert('Please enter all 3 words!');
  }

  try {
    // 1) Story
    const storyRes = await fetch('/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words: [w1, w2, w3] })
    });
    const { story } = await storyRes.json();
    document.getElementById('image-story').innerText = story || 'No story generated.';

    // 2) Image
    const imageRes = await fetch('/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: story })
    });
    const { url } = await imageRes.json();

    const imgEl = document.getElementById('dreamImage');
    if (url) {
      imgEl.src = url;
    } else {
      imgEl.src = '';
      alert('Image generation failed.');
    }
  } catch (err) {
    console.error('Error:', err);
    alert('Something went wrong. See console for details.');
  }
}
