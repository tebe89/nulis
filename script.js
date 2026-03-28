const getEl = id => document.getElementById(id);
let timerInterval, abortController;

// --- POPUP & TIMER ---
window.showPopup = (msg) => {
    let seconds = 0;
    getEl('popupTimer').innerText = "0s";
    clearInterval(timerInterval);
    timerInterval = setInterval(() => { seconds++; getEl('popupTimer').innerText = seconds + "s"; }, 1000);
    getEl('aiPopup').classList.remove('hidden');
    getEl('popupStatus').innerText = msg;
};
window.hidePopup = () => { getEl('aiPopup').classList.add('hidden'); clearInterval(timerInterval); };
window.cancelProcess = () => { if (abortController) { abortController.abort(); window.hidePopup(); } };

// --- STORAGE ---
window.saveDraft = () => {
    const chapters = [];
    document.querySelectorAll('.chapter-card').forEach(card => {
        chapters.push({
            label: card.querySelector('.ch-label').innerText,
            judul: card.querySelector('.ch-title-input').value,
            summary: card.querySelector('.ch-summary-input').value,
            content: card.querySelector('.ch-content-input').value
        });
    });
    const data = {
        apiKey: getEl('apiKey').value,
        model: getEl('modelSelect').value,
        title: getEl('novelTitle').value,
        genre: getEl('genre').value,
        style: getEl('style').value,
        idea: getEl('storyIdea').value,
        chapterCount: getEl('chapterCount').value,
        workspaceVisible: !getEl('novelWorkspace').classList.contains('hidden'),
        chapters: chapters
    };
    localStorage.setItem('tebe_v15_openrouter', JSON.stringify(data));
};

window.loadDraft = () => {
    const saved = localStorage.getItem('tebe_v15_openrouter');
    if (!saved) return;
    const data = JSON.parse(saved);
    getEl('apiKey').value = data.apiKey || "";
    getEl('novelTitle').value = data.title || "";
    getEl('genre').value = data.genre || "";
    getEl('style').value = data.style || "";
    getEl('storyIdea').value = data.idea || "";
    getEl('chapterCount').value = data.chapterCount || 3;
    if (data.apiKey) window.checkAndSaveApi(true);
    if (data.workspaceVisible) window.renderWorkspace(data.chapters, data.title);
};

// --- OPENROUTER ENGINE (SMART FILTER) ---
window.checkAndSaveApi = async (isSilent = false) => {
    const key = getEl('apiKey').value.trim();
    if(!key) return;
    if(!isSilent) window.showPopup("Memindai Model DeepSeek & Free...");
    try {
        const res = await fetch("https://openrouter.ai/api/v1/models");
        const data = await res.json();
        if(data.data) {
            // SMART FILTER: Mencari model yang harganya 0 ATAU mengandung kata "free"
            const filteredModels = data.data.filter(m => {
                const isFreePrice = parseFloat(m.pricing.prompt) === 0;
                const isFreeName = m.id.toLowerCase().includes('free');
                const isDeepseek = m.id.toLowerCase().includes('deepseek'); // Paksa DeepSeek masuk list
                return isFreePrice || isFreeName || isDeepseek;
            });

            // Urutkan agar yang ada kata "free" muncul di atas
            filteredModels.sort((a, b) => a.id.toLowerCase().includes('free') ? -1 : 1);

            getEl('savedTag').classList.remove('hidden');
            getEl('modelSelect').innerHTML = filteredModels.map(m => {
                const priceTag = parseFloat(m.pricing.prompt) === 0 ? "(FREE)" : "(CHEAP)";
                return `<option value="${m.id}">${m.name} ${priceTag}</option>`;
            }).join('');
            
            const savedData = JSON.parse(localStorage.getItem('tebe_v15_openrouter'));
            if(savedData && savedData.model) getEl('modelSelect').value = savedData.model;
            
            getEl('engineWrapper').classList.remove('hidden');
            getEl('btnCheck').innerText = "ENGINE READY ✓";
            getEl('btnCheck').style.backgroundColor = "#064e3b";
            window.saveDraft();
        }
    } catch (e) { if(!isSilent) alert("Gagal mengambil model OpenRouter."); }
    finally { window.hidePopup(); }
};

async function callAI(prompt) {
    const key = getEl('apiKey').value;
    const model = getEl('modelSelect').value;
    if(!key) throw new Error("API Key kosong.");
    
    abortController = new AbortController();
    
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json"
        },
        signal: abortController.signal,
        body: JSON.stringify({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
            "top_p": 1
        })
    });
    
    const data = await res.json();
    if (data.choices && data.choices[0]) {
        return data.choices[0].message.content.trim();
    }
    if (data.error) throw new Error(data.error.message);
    throw new Error("Respons AI kosong.");
}

// --- CORE FUNCTIONS ---
window.planNovel = async () => {
    const idea = getEl('storyIdea').value;
    if(!idea) return alert("Isi Ide!");
    window.showPopup("Merancang Alur...");
    try {
        const count = getEl('chapterCount').value;
        const prompt = `Buat alur novel dalam JSON murni: [{"label":"Prolog","judul":"...","summary":"..."},{"label":"Bab 1","judul":"...","summary":"..."},{"label":"Epilog","judul":"...","summary":"..."}]. Total bab tengah ${count}. Ide: ${idea}`;
        const raw = await callAI(prompt);
        // Pembersihan jika AI memberi teks tambahan di luar JSON
        const jsonPart = raw.substring(raw.indexOf('['), raw.lastIndexOf(']') + 1);
        window.renderWorkspace(JSON.parse(jsonPart), getEl('novelTitle').value);
        window.saveDraft();
    } catch (e) { if(e.name !== 'AbortError') alert("Error: " + e.message); }
    finally { window.hidePopup(); }
};

window.writeChapter = async (i) => {
    window.showPopup(`Menulis ${document.querySelectorAll('.ch-label')[i].innerText}...`);
    const titles = document.querySelectorAll('.ch-title-input');
    const summaries = document.querySelectorAll('.ch-summary-input');
    
    let pastContext = "";
    const allSummaries = document.querySelectorAll('.ch-summary-input');
    for(let j=0; j<i; j++) { pastContext += `Bab ${j+1}: ${allSummaries[j].value}\n`; }

    const prompt = `Tulis naskah novel profesional untuk: ${titles[i].value}. 
    Alur: ${summaries[i].value}. 
    Konteks sebelumnya: ${pastContext || "Awal cerita."}
    Genre: ${getEl('genre').value}. Gaya: ${getEl('style').value}. 
    WAJIB: Gunakan EYD, koma, titik, dan spasi yang benar. Minimal 1500 kata. JANGAN menulis sapaan.`;
    
    try {
        const res = await callAI(prompt);
        document.querySelectorAll('.ch-content-input')[i].value = res;
        window.saveDraft();
    } catch (e) { if(e.name !== 'AbortError') alert("Gagal Menulis."); }
    finally { window.hidePopup(); }
};

window.renderWorkspace = (plan, title) => {
    getEl('mainPlaceholder').classList.add('hidden');
    getEl('displayTitle').innerText = title || "Karya Tebe";
    getEl('novelWorkspace').classList.remove('hidden');
    getEl('chaptersArea').innerHTML = plan.map((item, i) => `
        <div class="chapter-card bg-[#111] p-6 rounded-2xl border border-gray-900 mb-8 shadow-xl">
            <div class="flex justify-between border-b border-gray-800 pb-4">
                <div class="flex-1">
                    <span class="ch-label text-[9px] gold-text font-bold uppercase">${item.label}</span>
                    <input type="text" class="ch-title-input w-full text-lg font-bold bg-transparent outline-none text-white" value="${item.judul}" oninput="window.saveDraft()">
                    <textarea class="ch-summary-input summary-box mt-2" rows="3" oninput="window.saveDraft()">${item.summary || item.ringkasan}</textarea>
                </div>
                <button onclick="writeChapter(${i})" class="h-fit bg-white text-black px-6 py-2 rounded-full text-[10px] font-black hover:bg-yellow-500">TULIS</button>
            </div>
            <textarea class="ch-content-input content-box mt-4" rows="15" oninput="window.saveDraft()">${item.content || ""}</textarea>
            <div class="flex justify-end gap-2 mt-2">
                <button onclick="window.downloadSingle(${i}, 'txt')" class="text-[9px] bg-gray-800 px-3 py-1 rounded text-gray-400">TXT</button>
                <button onclick="window.downloadSingle(${i}, 'html')" class="text-[9px] border border-gray-800 px-3 py-1 rounded text-gray-400">HTML</button>
            </div>
        </div>
    `).join('');
};

// --- DOWNLOAD SYSTEM ---
const htmlHeader = (title) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
    @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@400;700&family=Cinzel:wght@700&display=swap');
    body { background:#f4ece0; color:#2c2c2c; font-family:'Crimson Pro',serif; line-height:1.7; margin:0; padding:0; text-align:justify; }
    .page { max-width: 95%; margin: 10px auto; background: white; padding: 25px; box-shadow: 0 0 10px rgba(0,0,0,0.05); border-radius: 5px; }
    @media (min-width: 768px) { .page { max-width: 800px; padding: 60px 80px; margin: 40px auto; } }
    h1 { font-family:'Cinzel',serif; text-align:center; color:#8b6b23; font-size: 2.5rem; margin: 40px 0; }
    h2 { font-family:'Cinzel',serif; text-align:center; color:#8b6b23; font-size: 1.8rem; margin: 40px 0 20px 0; border-bottom: 1px solid #eee; padding-bottom: 10px; }
    p { margin-bottom: 1.2rem; text-indent: 2rem; font-size: 1.2rem; }
    .cover { height: 90vh; display: flex; flex-direction: column; justify-content: center; align-items: center; border: 8px double #8b6b23; margin: 10px; background:white;}
</style></head><body>`;

window.downloadSingle = (i, format) => {
    const card = document.querySelectorAll('.chapter-card')[i];
    const t = card.querySelector('.ch-title-input').value;
    const c = card.querySelector('.ch-content-input').value;
    let res = (format === 'html') ? 
        `${htmlHeader(t)}<div class="page"><h2>${t}</h2>${c.split('\n').filter(p=>p.trim()!="").map(p=>`<p>${p.trim()}</p>`).join('')}</div></body></html>` : 
        `[ ${t} ]\n\n${c}`;
    saveFile(res, `${t}.${format}`, format);
};

window.downloadFull = (format) => {
    const title = getEl('novelTitle').value || 'Novel';
    let res = "";
    if (format === 'html') {
        res = `${htmlHeader(title)}<div class="cover"><h1>${title}</h1><p>Karya Sastra Terpilih</p></div>`;
        document.querySelectorAll('.chapter-card').forEach(card => {
            const t = card.querySelector('.ch-title-input').value;
            const c = card.querySelector('.ch-content-input').value;
            res += `<div class="page"><h2>${t}</h2>${c.split('\n').filter(p=>p.trim()!="").map(p=>`<p>${p.trim()}</p>`).join('')}</div>`;
        });
        res += "</body></html>";
    } else {
        document.querySelectorAll('.chapter-card').forEach(card => {
            res += `\n\n--- ${card.querySelector('.ch-title-input').value.toUpperCase()} ---\n\n${card.querySelector('.ch-content-input').value}`;
        });
    }
    saveFile(res, `${title}_Lengkap.${format}`, format);
};

function saveFile(str, name, format) {
    const blob = new Blob([str], { type: format === 'html' ? 'text/html' : 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = name; a.click();
}

window.clearAllData = () => { if(confirm("Hapus semua draf?")) { localStorage.clear(); location.reload(); } };

window.onload = window.loadDraft;
