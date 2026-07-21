// ============================================================
//  app.js — SummAI
//  Features: Auth guard, Text / Voice / Image-OCR / URL / YouTube
//             Language detection, Summarization (Groq API)
// ============================================================

const GROQ_API     = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = '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';
const MODEL        = 'llama-3.3-70b-versatile';

// ---------- State ----------
let selectedLength   = 'short';
let selectedOutLang  = 'auto';
let currentSummary   = '';
let currentInputLang = 'english';
let activeInputTab   = 'text';

// Voice state
let recognition     = null;
let isRecording     = false;
let voiceTranscript = '';

// Image state
let imageBase64    = null;
let imageMediaType = 'image/jpeg';
let ocrExtracted   = '';

// Video state
let videoExtracted = '';

// ---------- Session ----------
const session = () => DB.Session.get();

// ---------- Auth Guard ----------
(function guard() {
  const user = session();
  if (!user) { window.location.href = 'index.html'; return; }
  const nameEl   = document.getElementById('navUserName');
  const avatarEl = document.getElementById('navAvatar');
  if (nameEl)   nameEl.textContent   = user.name;
  if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
})();

function logout() {
  DB.Session.clear();
  window.location.href = 'index.html';
}

// ---------- Toast ----------
function showToast(msg, type = 'info') {
  const t    = document.getElementById('toast');
  const icon = type === 'success' ? '✅' : type === 'danger' ? '❌' : 'ℹ️';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3800);
}

// ---------- Input Tab Switcher ----------
function switchInputTab(tab, btn) {
  activeInputTab = tab;
  document.querySelectorAll('.itab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.input-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${tab}`).classList.add('active');
  if (tab !== 'voice' && isRecording) stopRecording();
}

// ---------- Options ----------
function setLength(val, btn) {
  selectedLength = val;
  document.querySelectorAll('#lengthToggle .tog').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
function setOutLang(val, btn) {
  selectedOutLang = val;
  document.querySelectorAll('#outputLangToggle .tog').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ---------- Text Input ----------
function onTextInput() {
  const text = document.getElementById('inputText').value;
  const len  = text.length;
  document.getElementById('charCount').textContent = `${len} character${len !== 1 ? 's' : ''}`;
  if (len > 20) {
    currentInputLang = detectLanguage(text);
    const langName = { english: 'English', hindi: 'हिंदी (Hindi)', marathi: 'मराठी (Marathi)' }[currentInputLang];
    document.getElementById('detectedLang').textContent = `Language: ${langName}`;
  } else {
    document.getElementById('detectedLang').textContent = 'Language: —';
  }
}

function onVideoInput() {
  const text = document.getElementById('videoTranscript').value;
  videoExtracted = text;
  const len  = text.length;
  document.getElementById('videoCharCount').textContent = `${len} character${len !== 1 ? 's' : ''}`;
  if (len > 20) {
    currentInputLang = detectLanguage(text);
    const langName = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' }[currentInputLang];
    document.getElementById('videoDetectedLang').textContent = `Language: ${langName}`;
  } else {
    document.getElementById('videoDetectedLang').textContent = 'Language: —';
  }
}

// ---------- Language Detection ----------
function detectLanguage(text) {
  const devanagari = text.match(/[\u0900-\u097F]/g) || [];
  const total = text.replace(/\s/g, '').length;
  if (total === 0 || devanagari.length / total < 0.15) return 'english';
  const marathiWords = ['आहे','नाही','मला','तुम्ही','आपण','हे','ते','या','माझे','तुझे','होते','असे','काय','कसे','आम्ही','आणि','पण','म्हणून'];
  const hindiWords   = ['है','नहीं','मैं','हम','तुम','आप','यह','वह','कि','और','से','को','के','में','पर','था','थे','होना','जो','लेकिन'];
  let mScore = 0, hScore = 0;
  marathiWords.forEach(w => { if (text.includes(w)) mScore++; });
  hindiWords.forEach(w => { if (text.includes(w)) hScore++; });
  return mScore > hScore ? 'marathi' : 'hindi';
}

// ---------- Build Prompt ----------
function buildPrompt(text, inputLang, outLang, length, sourceType = 'article') {
  const resolved = outLang === 'auto' ? inputLang : outLang;
  const lengthMap = {
    short:  'Write a SHORT summary in 2–3 sentences only.',
    medium: 'Write a MEDIUM summary in 4–6 sentences covering all main points.',
    long:   'Write a LONG summary in 8–12 sentences covering all key details, facts, and supporting points.',
  };
  const langMap     = { english: 'English', hindi: 'Hindi (हिंदी)', marathi: 'Marathi (मराठी)' };
  const outLangName = langMap[resolved]   || 'English';
  const inLangName  = langMap[inputLang]  || 'English';
  const srcLabel    = sourceType === 'video' ? 'YouTube video transcript' : sourceType === 'url' ? 'webpage article' : 'text';

  return `You are SummAI, an expert multilingual summarization assistant.

Task: Summarize the provided ${srcLabel} accurately.
1. ${lengthMap[length]}
2. Output ONLY in ${outLangName}. Use NO other language.
3. Do NOT add preambles, labels, or explanations — return ONLY the summary.
4. Preserve key facts, context, and meaning.
${sourceType === 'video' ? '5. Focus on the main topic, key insights, and conclusions of the video.' : ''}

Input ${srcLabel} (in ${inLangName}):
"""
${text.slice(0, 12000)}
"""

Return ONLY the summary in ${outLangName}:`;
}

// ---------- Groq API Call ----------
async function callGroq(messages) {
  const response = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, messages }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ---------- Groq Vision API Call ----------
async function callGroqVision(base64, mediaType, prompt) {
  const response = await fetch(GROQ_API, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: 'text', text: prompt }
        ]
      }]
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Vision API error ${response.status}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ============================================================
//  URL FETCH
// ============================================================

function clearUrlPreview() {
  urlExtracted = '';
  document.getElementById('urlResultWrap').style.display = 'none';
}

async function fetchUrl() {
  let url = document.getElementById('urlInput').value.trim();
  if (!url) {
    showToast('Please paste a URL first', 'danger');
    return;
  }
  // Auto-add https:// if missing
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  // Basic domain check
  try { new URL(url); } catch {
    showToast('Please enter a valid URL', 'danger');
    return;
  }

  const btn = document.querySelector('.btn-fetch');
  const origText = btn.textContent;
  btn.textContent = 'Fetching…';
  btn.disabled = true;

  function extractMainText(html) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    ['script','style','nav','footer','header','aside','noscript','iframe','form','button'].forEach(tag => {
      doc.querySelectorAll(tag).forEach(el => el.remove());
    });
    const main = doc.querySelector('article, main, [role="main"], .content, .post-content, .article-body, .entry-content, #content')
                 || doc.body;
    return (main ? (main.innerText || main.textContent) : doc.body.textContent)
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Method 1 (primary): Claude AI with web_search tool ──
  let extracted = '';
  try {
    btn.textContent = 'Reading with AI…';
    const hostname = new URL(url).hostname.replace('www.', '');
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a web content extraction assistant. The user gives you a URL. 
Use the web_search tool to search for content from that page or website. 
Search using the site's domain and relevant keywords to find the actual article or page content.
For news homepages, search for the latest headlines from that site.
Return ONLY the extracted content text — headlines, article text, summaries. 
No meta-commentary, no "I found...", no labels. Just the raw content, 300-800 words.`,
        messages: [{ role: 'user', content: `Extract content from this URL: ${url}\nSearch query hint: site:${hostname} latest news OR articles` }]
      })
    });

    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const textBlocks = (aiData.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text || '')
        .join('\n\n')
        .trim();
      if (textBlocks.length > 150) extracted = textBlocks;
    }
  } catch (e) { /* fall through to proxies */ }

  // ── Method 2 (fallback): allorigins proxy ──
  if (extracted.length < 200) {
    try {
      btn.textContent = 'Fetching…';
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        extracted = extractMainText(data.contents || '');
      }
    } catch (e) { /* try next */ }
  }

  // ── Method 3 (fallback): corsproxy.io ──
  if (extracted.length < 200) {
    try {
      const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        extracted = extractMainText(await res.text());
      }
    } catch (e) { /* try next */ }
  }

  // ── Method 4 (fallback): thingproxy ──
  if (extracted.length < 200) {
    try {
      const res = await fetch(`https://thingproxy.freeboard.io/fetch/${url}`,
        { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        extracted = extractMainText(await res.text());
      }
    } catch (e) { /* fall through */ }
  }

  if (extracted.length < 100) {
    showToast('Could not fetch this page. It may block scrapers. Try copy-pasting the text instead.', 'danger');
    btn.textContent = origText;
    btn.disabled    = false;
    return;
  }

  urlExtracted = extracted;
  const preview = urlExtracted.slice(0, 800) + (urlExtracted.length > 800 ? '…' : '');
  document.getElementById('urlText').textContent      = preview;
  document.getElementById('urlCharCount').textContent = `${urlExtracted.length} characters`;

  const detected = detectLanguage(urlExtracted);
  currentInputLang = detected;
  const names = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
  document.getElementById('urlDetectedLang').textContent = `Language: ${names[detected]}`;
  document.getElementById('urlResultWrap').style.display = 'block';

  showToast(`Page loaded! ${urlExtracted.length.toLocaleString()} characters ready.`, 'success');

  btn.textContent = origText;
  btn.disabled    = false;
}

// ============================================================
//  YOUTUBE TRANSCRIPT FETCH
// ============================================================

function clearYtPreview() {
  const wrap = document.getElementById('ytStatusWrap');
  if (wrap) wrap.style.display = 'none';
  const thumbWrap = document.getElementById('ytThumbWrap');
  if (thumbWrap) thumbWrap.style.display = 'none';
}

function onYtUrlInput() {
  clearYtPreview();
  const url = document.getElementById('ytUrlInput').value.trim();
  const videoId = extractYouTubeId(url);
  const thumbWrap = document.getElementById('ytThumbWrap');
  if (videoId && thumbWrap) {
    document.getElementById('ytThumb').src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    document.getElementById('ytVideoTitle').textContent = '';
    thumbWrap.style.display = 'block';
    // Try to fetch video title via oEmbed
    fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.title) document.getElementById('ytVideoTitle').textContent = d.title;
      }).catch(() => {});
  } else if (thumbWrap) {
    thumbWrap.style.display = 'none';
  }
}

function extractYouTubeId(url) {
  const patterns = [
    /(?:v=|\/embed\/|\/v\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function setYtStatus(icon, msg, show = true) {
  const wrap = document.getElementById('ytStatusWrap');
  document.getElementById('ytStatusIcon').textContent = icon;
  document.getElementById('ytStatusMsg').textContent  = msg;
  wrap.style.display = show ? 'flex' : 'none';
}

async function fetchYouTube() {
  const url = document.getElementById('ytUrlInput').value.trim();
  if (!url) {
    showToast('Please paste a YouTube URL first', 'danger');
    return;
  }

  const videoId = extractYouTubeId(url);
  if (!videoId) {
    showToast('Could not detect a valid YouTube video ID from this URL', 'danger');
    return;
  }

  const btn = document.querySelector('.yt-btn');
  btn.textContent = 'Fetching…';
  btn.disabled    = true;
  setYtStatus('⏳', 'Fetching YouTube info…');

  try {
    let transcript = '';

    // ── Method 1: youtubetranscript.com via allorigins proxy ──
    try {
      setYtStatus('⏳', 'Trying transcript source 1…');
      const res  = await fetch(
        `https://api.allorigins.win/get?url=${encodeURIComponent(`https://youtubetranscript.com/?server_vid2=${videoId}`)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = await res.json();
        const html = data.contents || '';
        const parser = new DOMParser();
        const doc    = parser.parseFromString(html, 'text/html');
        // Try structured elements first
        const lines = Array.from(doc.querySelectorAll('text, span[data-start], .transcript-line'))
                           .map(el => el.textContent.trim())
                           .filter(t => t.length > 2);
        transcript = lines.join(' ').replace(/\s+/g, ' ').trim();
        // Fallback to body text if needed
        if (transcript.length < 150) {
          const bodyText = doc.body.textContent.replace(/\s+/g, ' ').trim();
          if (bodyText.length > transcript.length) transcript = bodyText;
        }
      }
    } catch (e) { /* try next method */ }

    // ── Method 2: tactiq.io transcript API via corsproxy ──
    if (transcript.length < 150) {
      try {
        setYtStatus('⏳', 'Trying transcript source 2…');
        const res = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(`https://tactiq-apps-prod.tactiq.io/transcript?videoUrl=https://youtube.com/watch?v=${videoId}`)}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (res.ok) {
          const data = await res.json();
          if (data && data.transcript) {
            transcript = Array.isArray(data.transcript)
              ? data.transcript.map(s => s.text || s).join(' ')
              : String(data.transcript);
          }
        }
      } catch (e) { /* try next method */ }
    }

    // ── Method 3: YouTube oEmbed + AI-based description as fallback ──
    if (transcript.length < 150) {
      try {
        setYtStatus('⏳', 'Fetching video details…');
        const oEmbedRes = await fetch(
          `https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`,
          { signal: AbortSignal.timeout(6000) }
        );
        if (oEmbedRes.ok) {
          const oEmbed = await oEmbedRes.json();
          const title  = oEmbed.title || '';
          const author = oEmbed.author_name || '';
          if (title) {
            // Use AI to generate a description based on title + metadata
            setYtStatus('⏳', 'Generating AI summary from video metadata…');
            const aiPrompt = `The user wants to summarize a YouTube video titled: "${title}" by "${author}" (Video ID: ${videoId}).
Since a transcript is not available, provide a concise informational summary of what this video likely covers based on its title and known context. 
Be factual and helpful. If you recognize the video or topic, summarize the key points. Otherwise summarize based on the title.
Keep it under 300 words.`;
            const aiSummary = await callGroq([{ role: 'user', content: aiPrompt }]);
            videoExtracted = aiSummary;
            const ta = document.getElementById('videoTranscript');
            ta.value = aiSummary;
            document.getElementById('videoCharCount').textContent = `${aiSummary.length} characters`;
            const names = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
            document.getElementById('videoDetectedLang').textContent = `Language: ${names[detectLanguage(aiSummary)]}`;
            setYtStatus('✅', `AI description loaded for: "${title}". You can now summarize it.`);
            showToast('Video details loaded via AI (transcript unavailable).', 'success');
            return;
          }
        }
      } catch (e) { /* fall through to manual */ }
    }

    if (transcript.length < 80) throw new Error('transcript_not_found');

    videoExtracted = transcript;
    const ta = document.getElementById('videoTranscript');
    ta.value = transcript.slice(0, 5000) + (transcript.length > 5000 ? '\n[... transcript continues ...]' : '');
    document.getElementById('videoCharCount').textContent = `${transcript.length} characters`;

    const detected = detectLanguage(transcript);
    currentInputLang = detected;
    const names = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
    document.getElementById('videoDetectedLang').textContent = `Language: ${names[detected]}`;
    setYtStatus('✅', `Transcript loaded! ${transcript.length.toLocaleString()} characters ready.`);
    showToast('YouTube transcript loaded successfully!', 'success');

  } catch (err) {
    setYtStatus('⚠️',
      'Auto-fetch failed (subtitles may be disabled on this video). Please paste the transcript manually below.'
    );
    showToast('Could not auto-fetch transcript. Please paste it manually.', 'danger');
  } finally {
    btn.textContent = 'Get Transcript →';
    btn.disabled    = false;
  }
}

// ============================================================
//  VOICE MODE SWITCHER (Live Recording vs Upload Voice Note)
// ============================================================

let activeVoiceMode = 'live'; // 'live' | 'note'
let audioTranscribed = '';    // transcribed text from uploaded audio
let audioFile = null;         // the File object

function switchVoiceMode(mode, btn) {
  activeVoiceMode = mode;
  document.querySelectorAll('.vstab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.voice-subpanel').forEach(p => p.classList.remove('active'));
  document.getElementById(`vpanel-${mode}`).classList.add('active');
  if (mode !== 'live' && isRecording) stopRecording();
}

// ============================================================
//  AUDIO FILE UPLOAD (Voice Note → Whisper Transcription)
// ============================================================

function onAudioDragOver(e) {
  e.preventDefault();
  document.getElementById('audioDropZone').style.borderColor = 'var(--accent)';
}
function onAudioDrop(e) {
  e.preventDefault();
  document.getElementById('audioDropZone').style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) processAudioFile(file);
}
function onAudioSelect(e) {
  const file = e.target.files[0];
  if (file) processAudioFile(file);
}

function processAudioFile(file) {
  const validTypes = ['audio/mpeg','audio/wav','audio/wave','audio/x-wav','audio/mp4','audio/m4a',
                      'audio/ogg','audio/webm','audio/aac','audio/flac','audio/x-m4a',
                      'audio/wma','audio/x-ms-wma','audio/aiff','audio/x-aiff',
                      'audio/opus','audio/amr','audio/3gpp','audio/x-caf',''];
  const validExts  = /\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i;
  if (!validTypes.includes(file.type) && !validExts.test(file.name)) {
    showToast('Please upload a valid audio file (MP3, WAV, M4A, OGG, WEBM).', 'danger');
    return;
  }
  const maxMB = 25;
  if (file.size > maxMB * 1024 * 1024) {
    showToast(`Audio file is too large. Max ${maxMB}MB.`, 'danger');
    return;
  }

  audioFile = file;
  audioTranscribed = '';

  // Show file chip
  const sizeStr = file.size < 1024*1024
    ? `${(file.size/1024).toFixed(1)} KB`
    : `${(file.size/1024/1024).toFixed(1)} MB`;
  document.getElementById('audioFileName').textContent = file.name;
  document.getElementById('audioFileSize').textContent = sizeStr;
  document.getElementById('audioFileInfo').style.display = 'block';
  document.getElementById('audioDropZone').style.display = 'none';

  // Audio preview player
  const player = document.getElementById('audioPreviewPlayer');
  player.src = URL.createObjectURL(file);

  // Show transcribe section, hide old transcript
  document.getElementById('audioTranscribeWrap').style.display = 'block';
  document.getElementById('audioTranscriptWrap').style.display = 'none';
  document.getElementById('transcribeBtnText').textContent = '🔤 Transcribe Audio';
  document.getElementById('transcribeBtn').disabled = false;

  showToast(`Audio loaded: ${file.name}. Select language and transcribe.`, 'success');
}

function clearAudioFile() {
  audioFile = null;
  audioTranscribed = '';
  document.getElementById('audioFileInfo').style.display = 'none';
  document.getElementById('audioDropZone').style.display = '';
  document.getElementById('audioTranscribeWrap').style.display = 'none';
  document.getElementById('audioTranscriptWrap').style.display = 'none';
  if (document.getElementById('audioFileInput'))
    document.getElementById('audioFileInput').value = '';
  const player = document.getElementById('audioPreviewPlayer');
  player.pause();
  player.src = '';
}

async function transcribeAudio() {
  if (!audioFile) {
    showToast('Please upload an audio file first.', 'danger');
    return;
  }

  const btn  = document.getElementById('transcribeBtn');
  const txt  = document.getElementById('transcribeBtnText');
  btn.disabled = true;
  txt.textContent = '⏳ Transcribing…';

  try {
    const lang = document.getElementById('audioLang').value;

    // Build FormData for Whisper API
    const formData = new FormData();
    formData.append('file', audioFile, audioFile.name);
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');
    if (lang) formData.append('language', lang);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Whisper API error ${res.status}`);
    }

    const data = await res.json();
    const transcript = (data.text || '').trim();

    if (!transcript) {
      showToast('No speech detected in the audio file.', 'danger');
      txt.textContent = '🔤 Transcribe Audio';
      btn.disabled = false;
      return;
    }

    audioTranscribed = transcript;

    // Show result
    document.getElementById('audioTranscript').textContent = transcript;
    document.getElementById('audioCharCount').textContent  = `${transcript.length} characters`;
    document.getElementById('audioTranscriptWrap').style.display = 'block';

    const detected  = detectLanguage(transcript);
    currentInputLang = detected;
    const names     = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
    document.getElementById('audioDetectedLang').textContent = `Language: ${names[detected] || 'English'}`;

    txt.textContent  = '✅ Transcribed! Re-transcribe';
    btn.disabled = false;
    showToast(`Transcription complete! ${transcript.length} characters ready.`, 'success');

  } catch (err) {
    showToast('Transcription failed: ' + err.message, 'danger');
    txt.textContent = '🔤 Transcribe Audio';
    btn.disabled = false;
  }
}

// ============================================================
//  VOICE INPUT
// ============================================================

function toggleRecording() {
  if (isRecording) stopRecording();
  else startRecording();
}

function startRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Speech recognition is not supported. Try Chrome.', 'danger');
    return;
  }
  const lang = document.getElementById('voiceLang').value;
  recognition = new SpeechRecognition();
  recognition.continuous     = true;
  recognition.interimResults = true;
  recognition.lang           = lang;

  let interim = '';
  recognition.onresult = (e) => {
    let finalChunk = '';
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalChunk += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    if (finalChunk) voiceTranscript += finalChunk + ' ';
    updateVoiceDisplay(voiceTranscript + interim);
  };
  recognition.onerror = (e) => {
    if (e.error !== 'aborted') showToast(`Mic error: ${e.error}`, 'danger');
    stopRecording();
  };
  recognition.onend = () => {
    if (isRecording) { try { recognition.start(); } catch(_) {} }
  };
  recognition.start();
  isRecording = true;

  const btn = document.getElementById('recordBtn');
  btn.textContent = '⏹ Stop Recording';
  btn.classList.add('recording');
  document.getElementById('voiceIcon').classList.add('active');
  document.getElementById('voiceStatus').textContent = 'Listening… speak now';
}

function stopRecording() {
  isRecording = false;
  if (recognition) { try { recognition.stop(); } catch(_) {} recognition = null; }
  const btn = document.getElementById('recordBtn');
  btn.textContent = 'Start Recording';
  btn.classList.remove('recording');
  document.getElementById('voiceIcon').classList.remove('active');
  document.getElementById('voiceStatus').textContent = voiceTranscript
    ? 'Recording complete. Click Summarize!'
    : 'Press the button to start recording';
}

function updateVoiceDisplay(text) {
  const wrap = document.getElementById('voiceTranscriptWrap');
  const box  = document.getElementById('voiceTranscript');
  const cnt  = document.getElementById('voiceCharCount');
  const lang = document.getElementById('voiceDetectedLang');
  wrap.style.display = text ? 'block' : 'none';
  box.textContent    = text;
  cnt.textContent    = `${text.length} characters`;
  if (text.length > 20) {
    const detected = detectLanguage(text);
    const names    = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
    lang.textContent = `Language: ${names[detected]}`;
    currentInputLang = detected;
  }
}

// ============================================================
//  IMAGE OCR
// ============================================================

function onDragOver(e) {
  e.preventDefault();
  document.getElementById('imageDropZone').style.borderColor = 'var(--accent)';
}
function onImageDrop(e) {
  e.preventDefault();
  document.getElementById('imageDropZone').style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) processImageFile(file);
}
function onImageSelect(e) {
  const file = e.target.files[0];
  if (file) processImageFile(file);
}

async function processImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (PNG, JPG, WEBP).', 'danger'); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Image is too large. Max 5MB.', 'danger'); return;
  }
  imageMediaType = file.type;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    imageBase64   = dataUrl.split(',')[1];
    document.getElementById('previewImg').src = dataUrl;
    document.getElementById('imagePreview').style.display = 'block';
    document.getElementById('ocrResultWrap').style.display = 'none';
    ocrExtracted = '';
    showToast('Image loaded. Extracting text via OCR…', 'info');
    await runOCR();
  };
  reader.readAsDataURL(file);
}

async function runOCR() {
  try {
    const extracted = await callGroqVision(
      imageBase64, imageMediaType,
      `Extract ALL visible text from this image exactly as it appears.
Output ONLY the raw extracted text, preserving line breaks.
If no readable text, respond: [No text found]
No labels, explanations, or preambles.`
    );
    ocrExtracted = extracted === '[No text found]' ? '' : extracted;
    if (!ocrExtracted) { showToast('No readable text found in this image.', 'danger'); return; }

    const wrap = document.getElementById('ocrResultWrap');
    document.getElementById('ocrText').textContent = ocrExtracted;
    document.getElementById('ocrCharCount').textContent = `${ocrExtracted.length} characters`;
    wrap.style.display = 'block';

    currentInputLang = detectLanguage(ocrExtracted);
    const names = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
    document.getElementById('ocrDetectedLang').textContent = `Language: ${names[currentInputLang]}`;
    showToast(`Text extracted! (${ocrExtracted.length} chars)`, 'success');
  } catch (err) {
    showToast('OCR failed: ' + err.message, 'danger');
  }
}

// ---------- Get Active Input Text ----------
function getActiveInputText() {
  switch (activeInputTab) {
    case 'text':  return document.getElementById('inputText').value.trim();
    case 'voice':
      // Return audio transcript if in note mode, else live recording transcript
      if (activeVoiceMode === 'note') return audioTranscribed.trim();
      return voiceTranscript.trim();
    case 'image': return ocrExtracted.trim();
    case 'url':   return urlExtracted.trim();
    case 'video': return (videoExtracted || document.getElementById('videoTranscript').value).trim();
    default: return '';
  }
}

// ---------- Summarize ----------
async function summarize() {
  const inputText = getActiveInputText();
  if (!inputText || inputText.length < 20) {
    const hints = {
      text:  'Please type or paste at least 20 characters.',
      voice: activeVoiceMode === 'note'
        ? 'Please upload an audio file and transcribe it first.'
        : 'Please record some speech first.',
      image: 'Please upload an image with readable text first.',
      url:   'Please fetch a URL first using the Fetch button.',
      video: 'Please fetch a YouTube URL or paste a transcript first.',
    };
    showToast(hints[activeInputTab] || 'Please provide more content.', 'danger');
    return;
  }

  const btn     = document.getElementById('summarizeBtn');
  const btnText = document.getElementById('btnText');
  const btnLoad = document.getElementById('btnLoader');
  btn.disabled = true;
  btnText.classList.add('hidden');
  btnLoad.classList.remove('hidden');
  btnLoad.innerHTML = `<span class="spinner"></span> Summarizing…`;

  try {
    currentInputLang = detectLanguage(inputText);
    const sourceType = activeInputTab === 'url' ? 'url' : activeInputTab === 'video' ? 'video' : 'article';
    const prompt     = buildPrompt(inputText, currentInputLang, selectedOutLang, selectedLength, sourceType);
    const summary    = await callGroq([{ role: 'user', content: prompt }]);
    currentSummary   = summary;
    displayOutput(summary, currentInputLang, selectedLength);
    showToast('Summary ready! 🎉', 'success');

    // Save to DB history
    const usr = session();
    if (usr && usr.id) {
      let inputPreview = '';
      if (activeInputTab === 'text') inputPreview = (document.getElementById('inputText').value || '').slice(0, 200);
      else if (activeInputTab === 'voice') inputPreview = (voiceTranscript || '').slice(0, 200);
      else if (activeInputTab === 'image') inputPreview = (ocrExtracted || '').slice(0, 200);
      else if (activeInputTab === 'video') inputPreview = (videoExtracted || '').slice(0, 200);
      DB.History.add({ userId: usr.id, inputType: activeInputTab, inputPreview, summary, lang: selectedOutLang, length: selectedLength });
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'danger');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoad.classList.add('hidden');
    btnLoad.innerHTML = '';
  }
}

// ---------- Display Output ----------
function displayOutput(summary, inputLang, length) {
  const resolved  = selectedOutLang === 'auto' ? inputLang : selectedOutLang;
  const langNames = { english: 'English', hindi: 'हिंदी', marathi: 'मराठी' };
  const srcLabels = {
    text:  '📝 Text',
    voice: activeVoiceMode === 'note' ? '📎 Voice Note' : '🎙️ Voice',
    image: '🖼️ Image OCR',
    video: '▶️ YouTube',
  };
  document.getElementById('outLangPill').textContent   = `🌐 ${langNames[resolved] || 'English'}`;
  document.getElementById('outLengthPill').textContent = `📏 ${length.charAt(0).toUpperCase() + length.slice(1)}`;
  document.getElementById('outWordsPill').textContent  = `📝 ${summary.split(/\s+/).filter(Boolean).length} words`;
  document.getElementById('outSourcePill').textContent = srcLabels[activeInputTab] || '📝 Text';
  document.getElementById('outputBox').textContent     = summary;

  const sec = document.getElementById('outputSection');
  sec.classList.remove('hidden');
  sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Copy & Download ----------
function copyOutput() {
  navigator.clipboard.writeText(currentSummary).then(() => {
    const btn = document.querySelector('.icon-btn');
    btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
}
function downloadOutput() {
  const blob = new Blob([currentSummary], { type: 'text/plain;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `summai_${activeInputTab}_${selectedLength}_${Date.now()}.txt`;
  a.click();
}

// ---------- Clear ----------
function clearAll() {
  document.getElementById('inputText').value = '';
  document.getElementById('detectedLang').textContent = 'Language: —';
  document.getElementById('charCount').textContent = '0 characters';

  if (isRecording) stopRecording();
  voiceTranscript = '';
  updateVoiceDisplay('');
  document.getElementById('voiceStatus').textContent = 'Press the button to start recording';

  // Clear audio note state
  clearAudioFile();
  audioTranscribed = '';

  imageBase64 = null; ocrExtracted = '';
  document.getElementById('imagePreview').style.display = 'none';
  document.getElementById('ocrResultWrap').style.display = 'none';
  if (document.getElementById('imageFileInput'))
    document.getElementById('imageFileInput').value = '';

  urlExtracted = '';
  if (document.getElementById('urlInput')) document.getElementById('urlInput').value = '';
  if (document.getElementById('urlResultWrap')) document.getElementById('urlResultWrap').style.display = 'none';

  videoExtracted = '';
  if (document.getElementById('ytUrlInput')) document.getElementById('ytUrlInput').value = '';
  if (document.getElementById('videoTranscript')) document.getElementById('videoTranscript').value = '';
  if (document.getElementById('videoCharCount')) document.getElementById('videoCharCount').textContent = '0 characters';
  if (document.getElementById('ytStatusWrap')) document.getElementById('ytStatusWrap').style.display = 'none';

  document.getElementById('outputSection').classList.add('hidden');
  currentSummary   = '';
  currentInputLang = 'english';
  showToast('Cleared!', 'info');
}
