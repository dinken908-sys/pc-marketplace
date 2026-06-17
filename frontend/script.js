let components = [];
let currentUser = null;
let currentBuild = { cpu: null, gpu: null, ram: null, motherboard: null, ssd: null, psu: null };

async function loadComponents() {
    try {
        console.log('Загрузка компонентов с сервера...');
        const response = await fetch('/api/components');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        components = await response.json();
        console.log(`Загружено ${components.length} компонентов`);
        return components;
    } catch (error) {
        console.error('Ошибка загрузки компонентов:', error);
        components = [];
        return [];
    }
}

async function isAdminUser(userId) {
    try {
        const response = await fetch(`/api/user/${userId}/is-admin`);
        const data = await response.json();
        return data.is_admin;
    } catch (error) {
        console.error('Ошибка проверки админа:', error);
        return false;
    }
}

function logoutUser() {
    customConfirm('Выйти из аккаунта?', () => {
        localStorage.removeItem('currentUser');
        currentUser = null;
        window.location.reload();
    });
}

async function updateAuthUI() {
    const userStr = localStorage.getItem('currentUser');
    
    const authBtn = document.getElementById('authBtn');
    const profileBtn = document.getElementById('profileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminNavBtn = document.getElementById('adminNavBtn');
    
    const mobileAuthBtn = document.getElementById('mobileAuthBtn');
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    const mobileAdminNav = document.getElementById('mobileAdminNav');
    
    if (userStr) {
        currentUser = JSON.parse(userStr);
        
        let avatarUrl = null;
        try {
            const response = await fetch(`/api/user/profile/${currentUser.id}`);
            const data = await response.json();
            avatarUrl = data.profile?.avatar_url;
        } catch (error) {
            console.error('Error loading avatar:', error);
        }
        
        const avatarHtml = avatarUrl 
            ? `<img src="${avatarUrl}" class="nav-avatar" onerror="this.src='https://placehold.co/24x24/667eea/white?text=👤'">`
            : `<span class="nav-avatar-placeholder">👤</span>`;
        
        if (authBtn) authBtn.style.display = 'none';
        if (profileBtn) {
            profileBtn.style.display = 'inline-flex';
            profileBtn.style.alignItems = 'center';
            profileBtn.style.gap = '0.5rem';
            profileBtn.innerHTML = `${avatarHtml} ${currentUser.username}`;
        }
        if (logoutBtn) logoutBtn.style.display = 'inline-block';
        
        if (mobileAuthBtn) mobileAuthBtn.style.display = 'none';
        if (mobileProfileBtn) {
            mobileProfileBtn.style.display = 'flex';
            mobileProfileBtn.style.alignItems = 'center';
            mobileProfileBtn.style.gap = '0.5rem';
            mobileProfileBtn.innerHTML = `${avatarHtml} ${currentUser.username}`;
        }
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
        
        const isAdmin = await isAdminUser(currentUser.id);
        if (adminNavBtn) adminNavBtn.style.display = isAdmin ? 'inline-block' : 'none';
        if (mobileAdminNav) mobileAdminNav.style.display = isAdmin ? 'block' : 'none';
        
    } else {
        if (authBtn) authBtn.style.display = 'inline-block';
        if (profileBtn) profileBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (adminNavBtn) adminNavBtn.style.display = 'none';
        
        if (mobileAuthBtn) mobileAuthBtn.style.display = 'block';
        if (mobileProfileBtn) mobileProfileBtn.style.display = 'none';
        if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        if (mobileAdminNav) mobileAdminNav.style.display = 'none';
    }
}

function initMobileMenu() {
    const burger = document.getElementById('burgerMenu');
    const mobileNav = document.getElementById('mobileNav');
    const overlay = document.getElementById('mobileOverlay');
    
    if (!burger) return;
    
    function toggleMenu() {
        burger.classList.toggle('active');
        mobileNav.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    }
    
    const newBurger = burger.cloneNode(true);
    burger.parentNode.replaceChild(newBurger, burger);
    
    newBurger.addEventListener('click', toggleMenu);
    if (overlay) overlay.addEventListener('click', toggleMenu);
    
    if (mobileNav) {
        const links = mobileNav.querySelectorAll('a, button');
        links.forEach(link => {
            link.addEventListener('click', () => {
                if (mobileNav.classList.contains('active')) {
                    toggleMenu();
                }
            });
        });
    }
}

async function saveBuild(buildData) {
    if (!currentUser) {
        alert('Войдите в аккаунт, чтобы сохранить сборку');
        window.location.href = 'auth.html';
        return null;
    }
    
    try {
        const response = await fetch('/api/builds', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'user-id': currentUser.id
            },
            body: JSON.stringify(buildData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error('Ошибка сервера:', error);
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Ошибка сохранения сборки:', error);
        alert('Ошибка при сохранении сборки: ' + error.message);
        return null;
    }
}

async function getBuilds() {
    try {
        const response = await fetch('/api/builds');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Ошибка получения сборок:', error);
        return [];
    }
}

function addToBuild(componentId) {
    const component = components.find(c => c.id === componentId);
    if (!component) {
        console.error('Компонент не найден:', componentId);
        return;
    }
    
    const savedBuild = localStorage.getItem('tempBuild');
    let build = savedBuild ? JSON.parse(savedBuild) : {};
    
    build[component.type.toLowerCase()] = component;
    localStorage.setItem('tempBuild', JSON.stringify(build));
    
    alert(`${component.name} добавлен в сборку! Перейдите в "Сборка ПК" чтобы продолжить`);
}

function loadSavedBuild() {
    const saved = localStorage.getItem('tempBuild');
    if (saved) {
        currentBuild = JSON.parse(saved);
        updateBuildDisplay();
        console.log('Загружена сохраненная сборка:', currentBuild);
    }
}

function updateBuildDisplay() {
    const slots = ['cpu', 'gpu', 'ram', 'motherboard', 'ssd', 'psu'];
    slots.forEach(slot => {
        const element = document.getElementById(`${slot}Slot`);
        if (element && currentBuild[slot]) {
            const valueSpan = element.querySelector('.component-value');
            if (valueSpan) {
                valueSpan.textContent = `${currentBuild[slot].name} (${currentBuild[slot].price.toLocaleString('ru-RU')} ₽)`;
            }
        }
    });
    
    const total = Object.values(currentBuild).reduce((sum, comp) => sum + (comp?.price || 0), 0);
    const totalElement = document.getElementById('totalPrice');
    if (totalElement) totalElement.textContent = total.toLocaleString('ru-RU');
}

function customConfirm(message, onYes, onNo) {
    const modal = document.createElement('div');
    modal.className = 'custom-confirm';
    modal.innerHTML = `
        <div class="custom-confirm-content">
            <p>${message}</p>
            <div class="custom-confirm-buttons">
                <button class="confirm-yes">Да</button>
                <button class="confirm-no">Нет</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const yesBtn = modal.querySelector('.confirm-yes');
    const noBtn = modal.querySelector('.confirm-no');
    
    yesBtn.onclick = () => {
        modal.remove();
        if (onYes) onYes();
    };
    
    noBtn.onclick = () => {
        modal.remove();
        if (onNo) onNo();
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
            if (onNo) onNo();
        }
    };
}
function setupLogoutButtons() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        
        newLogoutBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Выйти из аккаунта?')) {
                localStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            }
            return false;
        };
    }
    
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    if (mobileLogoutBtn) {
        const newMobileLogoutBtn = mobileLogoutBtn.cloneNode(true);
        mobileLogoutBtn.parentNode.replaceChild(newMobileLogoutBtn, mobileLogoutBtn);
        
        newMobileLogoutBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Выйти из аккаунта?')) {
                localStorage.removeItem('currentUser');
                window.location.href = 'index.html';
            }
            return false;
        };
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setupLogoutButtons();
});
async function updateHeaderAvatar() {
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    
    const user = JSON.parse(userStr);
    const profileBtn = document.getElementById('profileBtn');
    const mobileProfileBtn = document.getElementById('mobileProfileBtn');
    
    if (!profileBtn && !mobileProfileBtn) return;
    
    try {
        const response = await fetch(`/api/user/profile/${user.id}`);
        const data = await response.json();
        const avatarUrl = data.profile?.avatar_url;
        
        const avatarHtml = avatarUrl 
            ? `<img src="${avatarUrl}?t=${Date.now()}" class="nav-avatar" onerror="this.src='https://placehold.co/28x28/667eea/white?text=👤'">`
            : `<span class="nav-avatar-placeholder">👤</span>`;
        
        if (profileBtn) {
            profileBtn.innerHTML = `${avatarHtml} ${user.username}`;
        }
        if (mobileProfileBtn) {
            mobileProfileBtn.innerHTML = `${avatarHtml} ${user.username}`;
        }
    } catch (error) {
        console.error('Error updating header avatar:', error);
    }
}
// Показать детали компонента в модальном окне
async function showComponentDetails(componentId) {
    const component = components.find(c => c.id === componentId);
    if (!component) {
        console.error('Компонент не найден:', componentId);
        return;
    }
    
    try {
        const response = await fetch(`/api/components/${componentId}/reviews`);
        const reviews = await response.json();
        
        let typeName = '';
        if (component.type === 'CPU') typeName = 'Процессор';
        else if (component.type === 'GPU') typeName = 'Видеокарта';
        else if (component.type === 'RAM') typeName = 'Оперативная память';
        else if (component.type === 'Motherboard') typeName = 'Материнская плата';
        else if (component.type === 'SSD') typeName = 'Накопитель SSD';
        else if (component.type === 'PSU') typeName = 'Блок питания';
        else if (component.type === 'Cooler') typeName = 'Охлаждение';
        else if (component.type === 'Case') typeName = 'Корпус';
        else typeName = component.type;
        
        const modalHtml = `
            <div class="modal-overlay" id="detailsModal" onclick="closeDetailsModal(event)">
                <div class="modal-content details-modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${escapeHtml(component.name)}</h3>
                        <button class="modal-close" onclick="closeDetailsModal()">✕</button>
                    </div>
                    <div class="details-body">
                        <div class="details-image">
                            <img src="${component.image || 'https://placehold.co/400x400/667eea/white?text=PC'}" alt="${component.name}">
                        </div>
                        <div class="details-info">
                            <p><strong>📋 Тип:</strong> ${typeName}</p>
                            <p><strong>💰 Цена:</strong> ${component.price.toLocaleString('ru-RU')} ₽</p>
                            <p><strong>📦 В наличии:</strong> ${component.stock} шт.</p>
                            <p><strong>⚙️ Характеристики:</strong> ${component.specs || 'Не указаны'}</p>
                            ${component.socket ? `<p><strong>🔌 Сокет:</strong> ${component.socket}</p>` : ''}
                            ${component.ram_type ? `<p><strong>💾 Тип памяти:</strong> ${component.ram_type}</p>` : ''}
                            ${component.power_wattage ? `<p><strong>⚡ Мощность:</strong> ${component.power_wattage}W</p>` : ''}
                            ${component.form_factor ? `<p><strong>📏 Форм-фактор:</strong> ${component.form_factor}</p>` : ''}
                        </div>
                    </div>
                    
                    <div class="reviews-section">
                        <h4>📝 Отзывы (${reviews.length})</h4>
                        <div class="reviews-list">
                            ${reviews.length === 0 ? '<p class="empty-reviews">Пока нет отзывов. Будьте первым!</p>' : 
                                reviews.map(r => `
                                    <div class="review-item">
                                        <div class="review-header">
                                            <strong>${escapeHtml(r.username)}</strong>
                                            <span class="rating">${'⭐'.repeat(r.rating)}</span>
                                            <small>${new Date(r.created_at).toLocaleDateString('ru-RU')}</small>
                                        </div>
                                        <p>${escapeHtml(r.comment)}</p>
                                    </div>
                                `).join('')
                            }
                        </div>
                        
                        ${currentUser ? `
                            <div class="add-review">
                                <h5>✍️ Оставить отзыв</h5>
                                <select id="reviewRating" class="review-rating">
                                    <option value="5">⭐⭐⭐⭐⭐ Отлично</option>
                                    <option value="4">⭐⭐⭐⭐ Хорошо</option>
                                    <option value="3">⭐⭐⭐ Средне</option>
                                    <option value="2">⭐⭐ Плохо</option>
                                    <option value="1">⭐ Ужасно</option>
                                </select>
                                <textarea id="reviewComment" rows="3" placeholder="Поделитесь своим опытом использования..."></textarea>
                                <button onclick="submitReview(${component.id})" class="submit-review-btn">✍️ Отправить отзыв</button>
                            </div>
                        ` : '<p class="login-to-review"><a href="auth.html">Войдите</a> чтобы оставить отзыв</p>'}
                    </div>
                    
                    <div class="details-actions">
                        <button onclick="addToBuild(${component.id}); closeDetailsModal()" class="add-to-build-btn">➕ Добавить в сборку</button>
                        <button onclick="addToCart(${component.id}); closeDetailsModal()" class="add-to-cart-details">🛒 В корзину</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
    } catch (error) {
        console.error('Error loading reviews:', error);
        alert('Ошибка загрузки отзывов');
    }
}

function closeDetailsModal(event) {
    if (event && event.target !== event.currentTarget && event.target.classList?.contains('modal-close') === false) return;
    const modal = document.getElementById('detailsModal');
    if (modal) modal.remove();
}

async function submitReview(componentId) {
    const rating = document.getElementById('reviewRating').value;
    const comment = document.getElementById('reviewComment').value;
    
    if (!comment.trim()) {
        alert('Напишите текст отзыва');
        return;
    }
    
    try {
        const response = await fetch(`/api/components/${componentId}/reviews`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'user-id': currentUser.id 
            },
            body: JSON.stringify({ rating: parseInt(rating), comment: comment })
        });
        
        if (response.ok) {
            alert('✅ Отзыв добавлен!');
            closeDetailsModal();
            showComponentDetails(componentId);
        } else {
            const error = await response.json();
            alert('❌ Ошибка: ' + (error.error || 'Не удалось добавить отзыв'));
        }
    } catch (error) {
        console.error('Error submitting review:', error);
        alert('❌ Ошибка при отправке отзыва');
    }
}
async function addToCart(componentId) {
    if (!currentUser) {
        customConfirm('Войдите в аккаунт, чтобы добавить товар в корзину', () => {
            window.location.href = 'auth.html';
        });
        return;
    }
    
    const component = components.find(c => c.id === componentId);
    if (!component) {
        alert('Компонент не найден');
        return;
    }
    
    const response = await fetch('/api/cart', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'user-id': currentUser.id 
        },
        body: JSON.stringify({
            item_type: 'component',
            item_id: component.id,
            item_data: {
                id: component.id,
                name: component.name,
                type: component.type,
                image: component.image || 'https://placehold.co/80x80/667eea/white?text=PC',
                price: component.price
            },
            price: component.price,
            quantity: 1
        })
    });
    
    if (response.ok) {
        alert(`✅ "${component.name}" добавлен в корзину!`);
    } else {
        const error = await response.json();
        alert('❌ Ошибка: ' + (error.error || 'Неизвестная ошибка'));
    }
}
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}