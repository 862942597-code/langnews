export default async function handler(req, res) {
  const { text, lang } = req.query;
  if (!text) return res.status(400).json({ error: 'Missing text' });
  const source = lang === 'english' ? 'en' : 'ja';
  const target = 'zh-CN';
  try {
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`);
    const data = await resp.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: 'Translate failed' });
  }
}