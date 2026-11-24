// ================= KONFIGURASI =================
const API_BASE = 'https://www.themealdb.com/api/json/v1/1';
const TRANSLATE_API = 'https://translate.googleapis.com/translate_a/single';
const CACHE_DURATION = 60 * 60 * 1000;
const FETCH_TIMEOUT = 12000;

// ================= ELEMEN DOM =================
const detailContainer = document.getElementById('recipeDetailContainer');
const breadcrumbTitle = document.getElementById('breadcrumbTitle');

// ================= UTILITY: ESCAPE HTML =================
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ================= FUNGSI TRANSLATE VIA GOOGLE API =================
/**
 * Menerjemahkan teks dari Bahasa Inggris ke Bahasa Indonesia
 * menggunakan Google Translate API gratis (unofficial endpoint).
 * 
 * @param {string} text - Teks yang akan diterjemahkan
 * @returns {Promise<string>} - Teks hasil terjemahan
 */
async function translateText(text) {
    if (!text || text.trim() === '') return '';

    try {
        const url = `${TRANSLATE_API}?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Translate API error');

        const data = await response.json();

        // Response Google Translate berupa array nested
        // data[0] = array of translations, setiap item = [translatedText, originalText, ...]
        if (data && data[0] && Array.isArray(data[0])) {
            return data[0]
                .filter(item => item && item[0])
                .map(item => item[0])
                .join('')
                .trim();
        }

        return text; // fallback ke teks asli jika gagal parse
    } catch (error) {
        console.warn('⚠️ Translate gagal, pakai teks asli:', error.message);
        return text; // fallback
    }
}

// ================= FUNGSI TRANSLATE BANYAK BARIS =================
/**
 * Menerjemahkan array of text sekaligus (paralel) untuk performa.
 * 
 * @param {string[]} texts - Array teks yang akan diterjemahkan
 * @returns {Promise<string[]>} - Array hasil terjemahan
 */
async function translateBatch(texts) {
    const promises = texts.map(text => translateText(text));
    return Promise.all(promises);
}

// ================= UTILITY: FETCH DENGAN TIMEOUT =================
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ================= UTILITY: CACHE =================
function getCache(key) {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

function setCache(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        console.warn('Cache tidak tersedia:', e);
    }
}

// ================= UTILITY: PRELOAD GAMBAR =================
function preloadImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
        setTimeout(() => resolve(false), 5000);
    });
}

// ================= UTILITY: ESTIMASI =================
function estimateTimeAndPortion(ingredientCount, stepCount) {
    let time = 15 + (ingredientCount * 2) + (stepCount * 3);
    time = Math.min(Math.max(time, 15), 120);
    let portion = 2;
    if (ingredientCount > 5) portion = 3;
    if (ingredientCount > 8) portion = 4;
    if (ingredientCount > 12) portion = 6;
    return { time, portion };
}

// ================= UTILITY: QUERY PARAM =================
function getQueryParam(param) {
    return new URLSearchParams(window.location.search).get(param);
}

// ================= LOAD DETAIL RESEP =================
async function loadRecipeDetail() {
    const idMeal = getQueryParam('id');

    if (!idMeal) {
        showError('Resep tidak ditemukan', 'ID resep tidak valid atau tidak disertakan.');
        return;
    }

    const cacheKey = `recipe_id_${idMeal}`;
    const cachedData = getCache(cacheKey);

    if (cachedData) {
        console.log('✅ Data dari cache');
        renderDetail(cachedData);
        return;
    }

    try {
        console.log('🌐 Fetch dari API...');
        const startTime = performance.now();
        const data = await fetchWithTimeout(`${API_BASE}/lookup.php?i=${idMeal}`);
        const elapsed = (performance.now() - startTime).toFixed(0);
        console.log(`⏱️ Response dalam ${elapsed}ms`);

        if (!data.meals || data.meals.length === 0) {
            showError('Resep tidak ditemukan', 'Resep dengan ID tersebut tidak ada di database.');
            return;
        }

        const meal = data.meals[0];

        // ===== TERJEMAHKAN LANGKAH MEMASAK =====
        // Tampilkan status loading "menerjemahkan..."
        detailContainer.innerHTML = `
            <div class="container py-5">
                <div class="text-center py-5">
                    <div class="spinner-border text-warning" role="status" style="width: 4rem; height: 4rem;"></div>
                    <p class="mt-3 text-muted fw-bold">Menerjemahkan resep ke Bahasa Indonesia...</p>
                    <small class="text-muted">Mohon tunggu sebentar 🌐</small>
                </div>
            </div>
        `;

        // Parse langkah-langkah
        let rawSteps = [];
        if (meal.strInstructions && meal.strInstructions.trim() !== '') {
            rawSteps = meal.strInstructions
                .split(/\r?\n/)
                .map(s => s.trim())
                .filter(s => s.length > 3)
                .filter(s => !/^(step|STEP)\s*\d+/i.test(s));

            // Jika tidak ada pemisah baris, bagi berdasarkan titik
            if (rawSteps.length === 1 && rawSteps[0].length > 300) {
                rawSteps = rawSteps[0]
                    .split(/\.\s+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 3)
                    .map(s => s.endsWith('.') ? s : s + '.');
            }
        }

        // Terjemahkan semua langkah sekaligus (paralel)
        console.log(`🔄 Menerjemahkan ${rawSteps.length} langkah...`);
        const translatedSteps = rawSteps.length > 0
            ? await translateBatch(rawSteps)
            : ['Langkah memasak tidak tersedia.'];

        // Simpan hasil terjemahan ke meal object
        meal.translatedSteps = translatedSteps;

        // Simpan ke cache
        setCache(cacheKey, meal);

        // Preload gambar
        await preloadImage(meal.strMealThumb);

        // Render
        console.log('✅ Terjemahan selesai, render halaman...');
        renderDetail(meal);

    } catch (error) {
        console.error('❌ Error:', error);
        if (error.name === 'AbortError') {
            showError('Koneksi Timeout', 'Server API tidak merespon. Coba lagi.');
        } else {
            showError('Gagal memuat data', 'Periksa koneksi internet Anda dan coba lagi.');
        }
    }
}

// ================= TAMPILKAN ERROR =================
function showError(title, message) {
    detailContainer.innerHTML = `
        <div class="container py-5">
            <div class="text-center py-5">
                <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
                <h3 class="fw-bold text-danger">${escapeHTML(title)}</h3>
                <p class="text-muted">${escapeHTML(message)}</p>
                <div class="mt-4">
                    <button onclick="location.reload()" class="btn btn-warning text-white px-4 py-2 fw-bold me-2">
                        <i class="fas fa-sync-alt me-2"></i>Coba Lagi
                    </button>
                    <a href="index.html" class="btn btn-outline-secondary px-4 py-2 fw-bold">
                        <i class="fas fa-arrow-left me-2"></i>Kembali
                    </a>
                </div>
            </div>
        </div>
    `;
}

// ================= RENDER DETAIL =================
function renderDetail(meal) {
    document.title = `${escapeHTML(meal.strMeal)} - ResepKu`;
    breadcrumbTitle.textContent = escapeHTML(meal.strMeal);

    // ===== BAHAN =====
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
        const ingredient = meal[`strIngredient${i}`];
        const measure = meal[`strMeasure${i}`];
        if (ingredient && ingredient.trim() !== '' && ingredient.trim() !== 'null') {
            ingredients.push({
                name: ingredient.trim(),
                measure: (measure && measure.trim() !== '') ? measure.trim() : ''
            });
        }
    }

    // ===== LANGKAH MEMASAK (sudah diterjemahkan) =====
    const steps = meal.translatedSteps && meal.translatedSteps.length > 0
        ? meal.translatedSteps
        : ['Langkah memasak tidak tersedia.'];

    const { time, portion } = estimateTimeAndPortion(ingredients.length, steps.length);

    // ===== HTML BAHAN =====
    let ingredientsHTML = ingredients.length > 0
        ? ingredients.map(item => `
            <div class="detail-ingredient-item">
                <span class="detail-ingredient-name">${escapeHTML(item.name)}</span>
                ${item.measure ? `<span class="detail-ingredient-measure">${escapeHTML(item.measure)}</span>` : ''}
            </div>
        `).join('')
        : '<p class="text-muted">Informasi bahan tidak tersedia.</p>';

    // ===== HTML LANGKAH =====
    let stepsHTML = steps.map((step, index) => `
        <div class="detail-step-item">
            <div class="detail-step-number">${index + 1}</div>
            <div class="detail-step-text">${escapeHTML(step)}</div>
        </div>
    `).join('');

    // ===== TOMBOL =====
    let actionButtons = '';
    if (meal.strYoutube) {
        actionButtons += `
            <a href="${escapeHTML(meal.strYoutube)}" target="_blank" rel="noopener" class="btn btn-youtube px-4 py-2 me-2 mb-2">
                <i class="fab fa-youtube me-2"></i> Tonton Video
            </a>
        `;
    }
    if (meal.strSource) {
        actionButtons += `
            <a href="${escapeHTML(meal.strSource)}" target="_blank" rel="noopener" class="btn btn-source px-4 py-2 mb-2">
                <i class="fas fa-external-link-alt me-2"></i> Sumber Asli
            </a>
        `;
    }

    // ===== RENDER =====
    detailContainer.innerHTML = `
        <div class="detail-hero">
            <img src="${escapeHTML(meal.strMealThumb)}" alt="${escapeHTML(meal.strMeal)}" class="detail-hero-img"
                 onerror="this.src='https://via.placeholder.com/1200x500?text=No+Image'">
            <div class="detail-hero-overlay"></div>
            <div class="container detail-hero-content">
                <span class="badge bg-warning text-dark mb-3 px-3 py-2 rounded-pill fw-bold">
                    <i class="fas fa-tag me-1"></i> ${escapeHTML(meal.strCategory || 'Umum')}
                </span>
                <h1 class="detail-title">${escapeHTML(meal.strMeal)}</h1>
                <p class="detail-area">
                    <i class="fas fa-globe me-2"></i>Masakan ${escapeHTML(meal.strArea || 'Internasional')}
                </p>
            </div>
        </div>

        <div class="container detail-info-section">
            <div class="row g-4">
                <div class="col-lg-12">
                    <p class="detail-description">
                        ${escapeHTML(meal.strMeal)} adalah hidangan ${escapeHTML(meal.strCategory || 'lezat').toLowerCase()} 
                        khas ${escapeHTML(meal.strArea || 'internasional')} yang mudah dibuat di rumah. 
                        Ikuti langkah-langkah di bawah untuk menyajikan hidangan istimewa untuk keluarga Anda.
                    </p>
                    <div class="detail-meta-row">
                        <div class="detail-meta-box">
                            <i class="fas fa-clock"></i>
                            <div>
                                <span class="detail-meta-label">Waktu</span>
                                <span class="detail-meta-value">${time} Menit</span>
                            </div>
                        </div>
                        <div class="detail-meta-box">
                            <i class="fas fa-utensils"></i>
                            <div>
                                <span class="detail-meta-label">Porsi</span>
                                <span class="detail-meta-value">${portion} Porsi</span>
                            </div>
                        </div>
                        <div class="detail-meta-box">
                            <i class="fas fa-shopping-basket"></i>
                            <div>
                                <span class="detail-meta-label">Bahan</span>
                                <span class="detail-meta-value">${ingredients.length} Item</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="container detail-main-section">
            <div class="row g-0 detail-two-column">
                <div class="col-lg-6 detail-col detail-col-left">
                    <h2 class="detail-section-title">Bahan</h2>
                    <div class="detail-ingredients">
                        ${ingredientsHTML}
                    </div>
                </div>
                <div class="col-lg-6 detail-col detail-col-right">
                    <h2 class="detail-section-title">Cara memasak:</h2>
                    <div class="detail-steps">
                        ${stepsHTML}
                    </div>
                </div>
            </div>

            ${actionButtons ? `
                <div class="text-center mt-5">
                    ${actionButtons}
                </div>
            ` : ''}

            <div class="text-center mt-4 mb-5">
                <a href="index.html" class="btn btn-outline-secondary px-4 py-2 rounded-pill">
                    <i class="fas fa-arrow-left me-2"></i>Kembali ke Beranda
                </a>
            </div>
        </div>
    `;

    if (window.AOS) AOS.refresh();
}

// ================= INISIALISASI =================
document.addEventListener('DOMContentLoaded', () => {
    if (window.AOS) {
        AOS.init({
            duration: 600,
            once: true,
            offset: 50,
            disable: 'mobile'
        });
    }

    window.addEventListener('scroll', () => {
        const nav = document.getElementById('mainNav');
        if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });

    loadRecipeDetail();
});