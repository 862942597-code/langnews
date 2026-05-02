export default async function handler(req, res) {
  const { word, lang } = req.query;
  if (!word) return res.status(400).json({ error: 'word required' });

  try {
    let apiUrl;
    if (lang === 'ja') {
      apiUrl = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    } else {
      apiUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    }

    const response = await fetch(apiUrl);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Dictionary fetch failed' });
  }
}