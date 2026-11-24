// ================= KONFIGURASI API =================
const API_BASE = 'https://www.themealdb.com/api/json/v1/1';
const WHATSAPP_NUMBER = '6288219687504';

// ================= ELEMEN DOM =================
const recipeList = document.getElementById('recipeList');
const popularRecipeList = document.getElementById('popularRecipeList');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const categoryFilter = document.getElementById('categoryFilter');
const resetBtn = document.getElementById('resetBtn');

// ================= INISIALISASI =================
document.addEventListener('DOMContentLoaded', () => {
    AOS.init({ duration: 800, once: true, offset: 100 });

    loadDefaultRecipes();
    loadPopularRecipes();

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const nav = document.getElementById('mainNav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    }, { passive: true });

    // ================= SCROLLSPY =================
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.navbar-nav .nav-link');

    function updateActiveNav() {
        const scrollY = window.pageYOffset;

        sections.forEach(current => {
            const sectionHeight = current.offsetHeight;
            const sectionTop = current.offsetTop - 150;
            const sectionId = current.getAttribute('id');

            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    let ticking = false;
    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateActiveNav();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    updateActiveNav();

    // ================= AUTO-SCROLL DARI HALAMAN DETAIL =================
    const scrollTarget = sessionStorage.getItem('scrollTo');
    if (scrollTarget) {
        sessionStorage.removeItem('scrollTo');
        setTimeout(() => {
            const target = document.getElementById(scrollTarget);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        }, 500);
    }
});

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

// ================= FETCH DATA =================
async function fetchRecipes(endpoint, renderTarget) {
    try {
        renderTarget.innerHTML = `
            <div class="text-center w-100 py-5">
                <div class="spinner-border text-warning" role="status" style="width: 3rem; height: 3rem;"></div>
                <p class="mt-3 text-muted fw-bold">Memuat resep lezat...</p>
            </div>
        `;

        const response = await fetch(`${API_BASE}/${endpoint}`);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();

        if (data.meals && data.meals.length > 0) {
            renderRecipes(data.meals, renderTarget);
        } else {
            renderTarget.innerHTML = `
                <div class="col-12 text-center py-5">
                    <i class="fas fa-search fa-4x text-muted mb-3 opacity-25"></i>
                    <h4 class="text-muted fw-bold">Resep tidak ditemukan.</h4>
                    <p class="text-muted">Coba kata kunci lain atau reset pencarian.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        renderTarget.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3 opacity-50"></i>
                <h4 class="text-danger fw-bold">Gagal memuat data.</h4>
                <p class="text-muted">Periksa koneksi internet Anda dan coba lagi.</p>
            </div>
        `;
    }
}

// ================= RENDER KARTU RESEP =================
function renderRecipes(meals, targetElement) {
    let html = '';
    const limitedMeals = meals.slice(0, 8);

    limitedMeals.forEach(meal => {
        const name = escapeHTML(meal.strMeal);
        const category = escapeHTML(meal.strCategory || 'Umum');
        const area = escapeHTML(meal.strArea || 'Internasional');
        const img = escapeHTML(meal.strMealThumb);
        const id = escapeHTML(meal.idMeal);

        html += `
            <div class="col-lg-3 col-md-4 col-sm-6" data-aos="fade-up">
                <div class="card recipe-card h-100">
                    <div class="position-relative overflow-hidden">
                        <img src="${img}" class="card-img-top" alt="${name}" loading="lazy" 
                             onerror="this.src='https://via.placeholder.com/400x300?text=No+Image'">
                        <span class="badge position-absolute top-0 end-0 m-3">${category}</span>
                    </div>
                    <div class="card-body d-flex flex-column">
                        <h5 class="card-title">${name}</h5>
                        <p class="card-text text-muted small mb-3">
                            <i class="fas fa-globe me-1 text-warning"></i> ${area}
                        </p>
                        <button class="btn btn-detail btn-sm mt-auto fw-bold" onclick="showRecipeDetail('${id}')">
                            Lihat Detail <i class="fas fa-arrow-right ms-1"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    targetElement.innerHTML = html;
    AOS.refresh();
}

// ================= REDIRECT KE HALAMAN DETAIL =================
function showRecipeDetail(idMeal) {
    window.location.href = `detail.html?id=${idMeal}`;
}

// ================= PENCARIAN =================
function searchRecipes() {
    const query = searchInput.value.trim();
    if (query) {
        fetchRecipes(`search.php?s=${encodeURIComponent(query)}`, recipeList);
        document.getElementById('resep-terbaru').scrollIntoView({ behavior: 'smooth' });
    } else {
        loadDefaultRecipes();
    }
}

// ================= FILTER KATEGORI =================
function filterByCategory() {
    const category = categoryFilter.value;
    if (category) {
        fetchRecipes(`filter.php?c=${encodeURIComponent(category)}`, recipeList);
        document.getElementById('resep-terbaru').scrollIntoView({ behavior: 'smooth' });
    } else {
        loadDefaultRecipes();
    }
}

// ================= RESET =================
function resetFilters() {
    searchInput.value = '';
    categoryFilter.value = '';
    loadDefaultRecipes();
    document.getElementById('resep-terbaru').scrollIntoView({ behavior: 'smooth' });
}

// ================= LOAD DEFAULT =================
function loadDefaultRecipes() {
    fetchRecipes('search.php?s=Chicken', recipeList);
}

function loadPopularRecipes() {
    fetchRecipes('filter.php?c=Dessert', popularRecipeList);
}

// ================= EVENT LISTENERS =================
searchBtn.addEventListener('click', searchRecipes);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchRecipes();
});
categoryFilter.addEventListener('change', filterByCategory);
resetBtn.addEventListener('click', resetFilters);

// ================= FORM KONTAK → WHATSAPP =================
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const message = document.getElementById('contactMessage').value.trim();

        if (!name || !email || !message) {
            alert('Mohon lengkapi semua field terlebih dahulu.');
            return;
        }

        const waMessage = 
            `Halo ResepKu! 👋%0A%0A` +
            `*Nama:* ${encodeURIComponent(name)}%0A` +
            `*Email:* ${encodeURIComponent(email)}%0A%0A` +
            `*Pesan:*%0A${encodeURIComponent(message)}`;

        const waURL = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMessage}`;
        window.open(waURL, '_blank');
        contactForm.reset();
    });
}

// ================= EXPOSE FUNCTION =================
window.showRecipeDetail = showRecipeDetail;