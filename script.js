/**
==========================================================================
АРХИВ 1831 — Интерактивная историческая реконструкция
Оптимизированная версия: ускорение рендеринга, устранение лагов, пакетные DOM-обновления
==========================================================================
*/
// ==========================================================================
// 1. КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ==========================================================================
const CONFIG = {
    INITIAL_STATS: { epidemy: 30, reputation: 60, treasury: 20 },
    CARD: {
        SWIPE_THRESHOLD: 120,
        MAX_DRAG_DISTANCE: 150,
        ROTATION_FACTOR: 15,
        ANIMATION_DURATION: 400,
        CHOICE_APPEAR_THRESHOLD: 20,
        CHOICE_FULL_OPACITY_AT: 100
    },
    TEXT_FIT: { CARD_MAX: 22, CARD_MIN: 13, CHOICE_MAX: 13, CHOICE_MIN: 9 },
    MONTHS: {
        full: ["Май ", "Июнь ", "Июль ", "Август ", "Сентябрь ", "Октябрь ", "Ноябрь ", "Декабрь ", "Январь ", "Февраль ", "Март ", "Апрель "],
        short: ["МАЙ ", "ИЮН ", "ИЮЛ ", "АВГ ", "СЕН ", "ОКТ ", "НОЯ ", "ДЕК ", "ЯНВ ", "ФЕВ ", "МАР ", "АПР "]
    },
    QUOTES: [
        "«Доктор Распайль считал камфору почти универсальной панацеей...» ",
        "«Телесная сила не предохраняет от болезни — она располагает к ней.» ",
        "«Цыганку Таню вылечили крапивой и горячим морским пуншем с ромом.» ",
        "«Они не внимали предостережениям и наелись на ночь сырых огурцов.» ",
        "«Деятельность нервной системы необходима для противодействия холере.» ",
        "«В городе в большом употреблении сигаретки из слоновой кости...» ",
        "«Почти никто не умер из тех, которые не позволяли себе излишеств.» "
    ],
    TRACKS: [
        { name: "Заблудший ", url: "music/Заблудший.mp3 " },
        { name: "Мрак ", url: "music/Мрак.mp3 " },
        { name: "Секреты ", url: "music/Секреты.mp3 " },
        { name: "Хватит ", url: "music/Хватит.mp3 " },
        { name: "Lilium (Music Box) ", url: "music/Lilium(Music_Box).mp3 " }
    ]
};

// ==========================================================================
// 2. СОСТОЯНИЕ ИГРЫ
// ==========================================================================
const gameState = {
    currentQuestionIndex: 0,
    stats: { ...CONFIG.INITIAL_STATS },
    isDragging: false,
    startX: 0,
    historicalAccuracy: { correct: 0, total: 0 },
    imageCache: new Map(),
    currentTrackIndex: 0,
    isHeartbeatPlaying: false,
    rafDragId: null
};

// ==========================================================================
// 3. DOM-ЭЛЕМЕНТЫ (кэширование)
// ==========================================================================
const DOM = {
    card: document.getElementById('game-card'),
    leftLabel: document.getElementById('choice-left'),
    rightLabel: document.getElementById('choice-right'),
    cardDateBelow: document.getElementById('card-date-below'),
    timelineMarker: document.getElementById('timeline-marker'),
    timelineLabels: document.getElementById('timeline-labels'),
    startScreen: document.getElementById('start-screen'),
    disclaimerScreen: document.getElementById('disclaimer-screen'),
    mainContent: document.querySelector('.main-layout'),
    gameOverScreen: document.getElementById('game-over-screen'),
    playBtn: document.getElementById('play-btn'),
    continueBtn: document.getElementById('continue-btn'),
    aboutBtn: document.getElementById('about-btn'),
    aboutModal: document.getElementById('about-modal'),
    closeAboutBtn: document.getElementById('close-about'),
    rulesBtn: document.getElementById('rules-btn'),
    rulesModal: document.getElementById('rules-modal'),
    closeRulesBtn: document.getElementById('close-rules'),
    audio: document.getElementById('bg-music'),
    playerIcon: document.getElementById('player-icon'),
    playerPanel: document.getElementById('player-panel'),
    prevTrackBtn: document.getElementById('prev-track'),
    nextTrackBtn: document.getElementById('next-track'),
    volumeSlider: document.getElementById('volume-slider'),
    volumeValue: document.getElementById('volume-value'),
    trackNameSpan: document.getElementById('track-name'),
    heartbeatSound: document.getElementById('heartbeat-sound'),
    particlesContainer: document.getElementById('particles'),
    typewriterEl: document.getElementById('typewriter')
};

// ==========================================================================
// 4. УТИЛИТЫ (Оптимизированы для снижения Layout Thrashing)
// ==========================================================================
function getEventX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
function getEventEndX(e) { return e.changedTouches ? e.changedTouches[0].clientX : e.clientX; }

function preloadImage(src) {
    if (!src || gameState.imageCache.has(src)) return Promise.resolve(gameState.imageCache.get(src));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { gameState.imageCache.set(src, img); resolve(img); };
        img.onerror = reject;
        img.src = src;
    });
}

function preloadAllImages() {
    const unique = new Set();
    questions.forEach(q => q.image && q.image.trim() && unique.add(q.image));
    console.log(`Предзагрузка ${unique.size} изображений...`);
    unique.forEach(src => preloadImage(src).catch(() => {}));
}

// Оптимизированный автофит: минимизирует принудительные рефлоу
function autoFitText(element, maxSize = CONFIG.TEXT_FIT.CARD_MAX, minSize = CONFIG.TEXT_FIT.CARD_MIN) {
    if (!element) return;
    element.style.height = '180px';
    element.style.overflow = 'hidden';
    let currentSize = maxSize;
    if (element.textContent.length < 120) { element.style.fontSize = currentSize + 'px'; return; }

    let iterations = 0;
    while (iterations < 5 && currentSize > minSize) {
        element.style.fontSize = currentSize + 'px';
        if (element.scrollHeight <= element.clientHeight) break;
        currentSize -= 1.5;
        iterations++;
    }
    if (currentSize <= minSize && element.scrollHeight > element.clientHeight) {
        element.style.display = '-webkit-box';
        element.style.webkitLineClamp = '6';
        element.style.webkitBoxOrient = 'vertical';
    }
}

function autoFitChoice(element, maxSize = CONFIG.TEXT_FIT.CHOICE_MAX, minSize = CONFIG.TEXT_FIT.CHOICE_MIN) {
    if (!element) return;
    let currentSize = maxSize;
    let iterations = 0;
    while (iterations < 4 && currentSize > minSize) {
        element.style.fontSize = currentSize + 'px';
        if (element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight) break;
        currentSize -= 1;
        iterations++;
    }
}

function preventImageDrag() {
    document.querySelectorAll('img').forEach(img => {
        img.ondragstart = () => false;
        img.oncontextmenu = () => false;
    });
}

// ==========================================================================
// 5. УПРАВЛЕНИЕ ЭКРАНАМИ
// ==========================================================================
function startGame() {
    if (DOM.mainContent) {
        DOM.mainContent.classList.remove('main-content-hidden');
        DOM.mainContent.classList.add('main-content-visible');
    }
    if (DOM.rulesBtn) DOM.rulesBtn.classList.add('ui-visible');
    if (gameState.currentQuestionIndex === 0) updateCardContent();
    setTimeout(() => {
        if (DOM.card) { DOM.card.style.pointerEvents = 'auto'; DOM.card.style.opacity = '1'; DOM.card.style.transform = 'scale(1)'; }
    }, CONFIG.CARD.ANIMATION_DURATION);
}

function hideDisclaimerAndStart() {
    DOM.disclaimerScreen.style.transition = 'opacity 0.8s ease';
    DOM.disclaimerScreen.style.opacity = '0';
    setTimeout(() => {
        DOM.disclaimerScreen.style.display = 'none';
        DOM.disclaimerScreen.style.visibility = 'hidden';
        startGame();
    }, 800);
}

// ==========================================================================
// 6. ТАЙМЛАЙН
// ==========================================================================
function updateTimelinePosition() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;
    const containerHeight = timelineContainer.offsetHeight;
    const padding = window.innerWidth <= 768 ? 10 : 20;
    const availableHeight = containerHeight - padding * 2;
    let position = padding + (gameState.currentQuestionIndex / (CONFIG.MONTHS.short.length - 1)) * availableHeight;

    if (window.innerWidth <= 768) {
        DOM.timelineMarker.style.left = `${position}px`;
        DOM.timelineMarker.style.top = '50%';
        DOM.timelineMarker.style.transform = 'translateY(-50%)';
    } else {
        DOM.timelineMarker.style.top = `${position}px`;
        DOM.timelineMarker.style.left = '50%';
        DOM.timelineMarker.style.transform = 'translateX(-50%)';
    }
    const ball = DOM.timelineMarker.querySelector('.marker-ball');
    if (ball) {
        const scale = window.innerWidth <= 768 ? 'translateY(-50%) scale(1.2)' : 'scale(1.2)';
        ball.style.transform = scale;
        setTimeout(() => { ball.style.transform = window.innerWidth <= 768 ? 'translateY(-50%) scale(1)' : 'scale(1)'; }, 200);
    }
}

function createTimelineLabels() {
    if (!DOM.timelineLabels) return;
    CONFIG.MONTHS.short.forEach(m => { const s = document.createElement('span'); s.textContent = m; DOM.timelineLabels.appendChild(s); });
}

// ==========================================================================
// 7. КАРТОЧКА И КОНТЕНТ (Пакетные DOM-обновления)
// ==========================================================================
function updateCardContent() {
    if (gameState.currentQuestionIndex >= questions.length) { showFinalVerdict(); return; }
    const data = questions[gameState.currentQuestionIndex];

    if (DOM.card) {
        DOM.card.classList.remove('border-blue', 'border-orange', 'border-red', 'border-gold');
        if (data.borderColor) DOM.card.classList.add(`border-${data.borderColor}`);
    }

    const imageContainer = document.querySelector('.card-image');
    const imgElement = imageContainer?.querySelector('img');
    let displayDate = data.date;
    if (!displayDate) {
        const m = CONFIG.MONTHS.full[gameState.currentQuestionIndex];
        const y = gameState.currentQuestionIndex < 7 ? "1831" : "1832";
        displayDate = `${m} ${y}`;
    }

    if (data.image && imgElement) {
        imgElement.style.display = 'block';
        const cached = gameState.imageCache.get(data.image);
        if (cached) {
            imgElement.src = cached.src;
            if (imageContainer) imageContainer.style.background = "transparent";
        } else {
            imgElement.style.opacity = '0';
            imgElement.src = data.image;
            imgElement.onload = () => { imgElement.style.opacity = '1'; };
            if (imageContainer) imageContainer.style.background = "transparent";
        }
        imgElement.setAttribute('draggable', 'false');
    } else if (imgElement) {
        imgElement.style.display = 'none';
        if (imageContainer) imageContainer.style.background = data.color || "#333";
    }

    const cardTextEl = document.querySelector('.card-text');
    const characterNameEl = document.querySelector('.character-name');

    if (cardTextEl) {
        cardTextEl.style.opacity = '0';
        setTimeout(() => {
            cardTextEl.innerHTML = data.text;
            autoFitText(cardTextEl);
            requestAnimationFrame(() => { cardTextEl.style.opacity = '1'; });
        }, 100);
    }
    if (characterNameEl) {
        characterNameEl.style.opacity = '0';
        setTimeout(() => { characterNameEl.innerHTML = data.name; characterNameEl.style.opacity = '1'; }, 50);
    }
    if (DOM.cardDateBelow) DOM.cardDateBelow.innerHTML = displayDate;

        const leftText = data.left?.trim() || '';
    const rightText = data.right?.trim() || '';

    // ✅ ГАРАНТИРОВАННО СКРЫВАЕМ ПЛАШКИ ПЕРЕД ОТРИСОВКОЙ НОВОЙ КАРТОЧКИ
    if (DOM.leftLabel) {
        DOM.leftLabel.style.opacity = '0';
        if (leftText) {
            DOM.leftLabel.innerText = leftText;
            DOM.leftLabel.style.display = 'block';
            autoFitChoice(DOM.leftLabel);
        } else {
            DOM.leftLabel.style.display = 'none';
        }
    }
    if (DOM.rightLabel) {
        DOM.rightLabel.style.opacity = '0';
        if (rightText) {
            DOM.rightLabel.innerText = rightText;
            DOM.rightLabel.style.display = 'block';
            autoFitChoice(DOM.rightLabel);
        } else {
            DOM.rightLabel.style.display = 'none';
        }
    }

    // Асинхронная предзагрузка
    [gameState.currentQuestionIndex + 1, gameState.currentQuestionIndex + 2].forEach(i => {
        if (i < questions.length && questions[i].image) preloadImage(questions[i].image).catch(() => {});
    });

    updateHeartbeat();
}

function resetCard() {
    gameState.currentQuestionIndex++;
    updateCardContent();
    if (gameState.currentQuestionIndex < questions.length && DOM.card) {
        DOM.card.style.transition = 'none';
        DOM.card.style.transform = 'translateX(0px) scale(0.9) rotate(0deg)';
        setTimeout(() => {
            DOM.card.style.transition = 'all 0.4s ease';
            DOM.card.style.opacity = '1';
            DOM.card.style.transform = 'translateX(0px) scale(1) rotate(0deg)';
        }, 50);
    }
}

// ==========================================================================
// 8. ОБРАБОТКА ПЕРЕТАСКИВАНИЯ (rAF Throttling + объединение патчей)
// ==========================================================================
function handleDragStart(e) {
    if (e.target.tagName === 'IMG') return;
    gameState.isDragging = true;
    gameState.startX = getEventX(e);
    DOM.card.style.transition = 'none';
    if (e.type === 'touchstart') e.preventDefault();
}

function handleDragMove(e) {
    if (!gameState.isDragging) return;
    if (e.type === 'touchmove') e.preventDefault();
    if (gameState.rafDragId) return; // Throttle to 60fps

    gameState.rafDragId = requestAnimationFrame(() => {
        const currentX = getEventX(e);
        let moveX = Math.max(-CONFIG.CARD.MAX_DRAG_DISTANCE, Math.min(CONFIG.CARD.MAX_DRAG_DISTANCE, currentX - gameState.startX));
        const rotation = moveX / CONFIG.CARD.ROTATION_FACTOR;
        DOM.card.style.transform = `translateX(${moveX}px) rotate(${rotation}deg)`;

        const absMove = Math.abs(moveX);
        const appearAt = CONFIG.CARD.CHOICE_APPEAR_THRESHOLD;
        const fullAt = CONFIG.CARD.CHOICE_FULL_OPACITY_AT;
        let opacity = 0;
        if (absMove > appearAt) {
            const progress = (absMove - appearAt) / (fullAt - appearAt);
            opacity = 1 - Math.pow(1 - Math.min(progress, 1), 2); // easeOutQuad
        }

        if (moveX > appearAt) { DOM.rightLabel.style.opacity = opacity; DOM.leftLabel.style.opacity = 0; }
        else if (moveX < -appearAt) { DOM.leftLabel.style.opacity = opacity; DOM.rightLabel.style.opacity = 0; }
        else { DOM.leftLabel.style.opacity = 0; DOM.rightLabel.style.opacity = 0; }

        gameState.rafDragId = null;
    });
}

function handleDragEnd(e) {
    if (!gameState.isDragging) return;
    gameState.isDragging = false;
    const endX = getEventEndX(e);
    const finalMoveX = endX - gameState.startX;

    if (Math.abs(finalMoveX) > CONFIG.CARD.SWIPE_THRESHOLD && DOM.card) {
        const direction = finalMoveX > 0 ? 1 : -1;
        const currentData = questions[gameState.currentQuestionIndex];
        let isBadEnd = false, badEndReason = " ", badChoiceText = " ", badEndEpilogue = " ";

        if (direction === -1) {
            badChoiceText = currentData.left;
            if (currentData.badEndLeft) {
                isBadEnd = true;
                badEndReason = currentData.badEndLeftReason || "Ваше решение привело к катастрофическим последствиям для империи. ";
                badEndEpilogue = currentData.badEndLeftEpilogue || " ";
            }
            if (!isBadEnd) {
                gameState.stats.epidemy += currentData.leftEff[0];
                gameState.stats.reputation += currentData.leftEff[1];
                gameState.stats.treasury += currentData.leftEff[2];
            }
        } else {
            badChoiceText = currentData.right;
            if (currentData.badEndRight) {
                isBadEnd = true;
                badEndReason = currentData.badEndRightReason || "Ваше решение привело к катастрофическим последствиям для империи. ";
                badEndEpilogue = currentData.badEndRightEpilogue || " ";
            }
            if (!isBadEnd) {
                gameState.stats.epidemy += currentData.rightEff[0];
                gameState.stats.reputation += currentData.rightEff[1];
                gameState.stats.treasury += currentData.rightEff[2];
            }
        }

        if (!isBadEnd && currentData.correctChoice) {
            gameState.historicalAccuracy.total++;
            if ((direction === -1 ? 'left' : 'right') === currentData.correctChoice) gameState.historicalAccuracy.correct++;
        }

        if (isBadEnd) { showBadEnd(badEndReason, badChoiceText, badEndEpilogue); return; }

        DOM.card.style.transition = 'all 0.4s cubic-bezier(0.23, 1, 0.32, 1)';
        DOM.card.style.transform = `translateX(${direction * 600}px) rotate(${direction * 60}deg)`;
        DOM.card.style.opacity = '0';
        setTimeout(resetCard, CONFIG.CARD.ANIMATION_DURATION);
    } else if (DOM.card) {
        DOM.card.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        DOM.card.style.transform = 'translateX(0px) rotate(0deg)';
    }
    DOM.leftLabel.style.opacity = 0;
    DOM.rightLabel.style.opacity = 0;
}

// ==========================================================================
// 9. КОНЦОВКИ ИГРЫ
// ==========================================================================
function showBadEnd(reasonText, badChoiceText, epilogueText) {
    stopHeartbeat();
    const box = DOM.gameOverScreen.querySelector('.game-over-box');
    const finalEpilogue = epilogueText || "Империя пала. История переписана навсегда...";
    box.innerHTML = `<div class="corner-bl"></div><div class="corner-br"></div><div class="bad-end-header"><div class="bad-end-skull">⚰️</div><h2 class="bad-end-title">ИСТОРИЯ ПРЕРВАНА</h2><div class="bad-end-skull">⚰️</div></div><div class="bad-end-divider"><span class="divider-line"></span><span class="divider-icon">✧</span><span class="divider-line"></span></div><div class="bad-end-choice"><span class="choice-label-text">Роковой выбор:</span><span class="choice-value">«${badChoiceText}»</span></div><div class="bad-end-consequence"><span class="consequence-icon">☠</span><p class="consequence-text">${reasonText}</p></div><div class="bad-end-divider"><span class="divider-line short"></span><span class="divider-icon">✦</span><span class="divider-line short"></span></div><p class="bad-end-epilogue">${finalEpilogue}</p><button class="restart-btn bad-end-restart" id="restart-btn"><span class="restart-sword">🗡️</span><span class="restart-text">НАЧАТЬ ЗАНОВО</span><span class="restart-sword">⚔️</span></button>`;
    DOM.gameOverScreen.style.display = 'flex';
}

function analyzeStats() {
    const stats = [{ value: gameState.stats.epidemy, icon: '🧪', label: 'Эпидемия' }, { value: gameState.stats.reputation, icon: '👑', label: 'Репутация' }, { value: gameState.stats.treasury, icon: '🪙', label: 'Казна' }];
    const dominant = stats.reduce((p, c) => Math.abs(c.value) > Math.abs(p.value) ? c : p);
    return { dominantStat: dominant, isPositive: dominant.value > 0, intensity: Math.abs(dominant.value), absValue: Math.abs(dominant.value) };
}

function getEndingText(analysis, accuracyPercent = 0) {
    const { isPositive, intensity } = analysis;
    if (accuracyPercent === 100) return "Вы стали тенью истории. Ни один хронист не упомянет вашего имени — и в этом ваше высшее достижение. Холера отступила к зиме, как и было предначертано: Николай I сохранил трон, Эссен — рассудок, а Мудров сгорел на своём посту, но не предал клятву. На Сенной не пролилась кровь, которой не должно было быть. Локомотив времени идёт точно по расписанию. Вы победили, исчезнув.";
    if (accuracyPercent <= 12) return "Вы выжили. Но тот Петербург, который знала история — с храбростью Эссена, с речью Императора на Сенной, с докторами, умиравшими на постах — тот Петербург вы убили. Вы заменили хронику мужества хроникой полумер. Смертей было больше. Бунты — жесточе. Вы не пустили поезд под откос — вы свернули на ржавый запасной путь, и он едва дотащился до станции, скрипя колёсами по костям тех, кто в настоящей истории остался жив.";
    if (accuracyPercent === 98) return "Почти безупречно. Но где-то — одна уступка страху, один компромисс — оставил шрам на ткани времени. Историки будущего найдут странную аномалию в архивах 1831 года: лишние три сотни имён в метрических книгах, или купца, разорившегося не вовремя, или врача, сломленного там, где должен был выстоять. Ткань истории цела. Но по ней прошла рябь, и кто-то в будущем это заметит.";
    if (isPositive && intensity >= 70) return "Ваша мудрость и хладнокровие спасли Империю от полного коллапса. История запомнит эти дни как время великого противостояния хаосу. ";
    if (isPositive && intensity >= 40) return "Вы удержали ситуацию на плаву. Цена была высока, но ткань истории сохранена. Санкт-Петербург выстоял. ";
    if (isPositive) return "Неплохо... но многие решения оказались половинчатыми. Империя выжила, но шрамы от тех событий будут заживать ещё долго. ";
    if (intensity >= 70) return "Катастрофа. Ваши решения спровоцировали цепную реакцию: бунты, экономический крах и падение доверия к власти. Локомотив времени сошёл с рельсов. ";
    if (intensity >= 40) return "Провал. Паника и неверные шаги погрузили город в анархию. Вы не смогли удержать баланс, и история переписана кровавыми чернилами. ";
    return "Досадная ошибка. Вы пытались действовать, но не хватило решимости или знаний. Эпидемия оставила после себя слишком глубокие раны. ";
}

function showFinalVerdict() {
    stopHeartbeat();
    const analysis = analyzeStats();
    const { isPositive, intensity } = analysis;
    let accuracyPercent = gameState.historicalAccuracy.total > 0 ? Math.round((gameState.historicalAccuracy.correct / gameState.historicalAccuracy.total) * 100) : 0;
    let accuracyText = "КАТАСТРОФИЧЕСКИ ", accuracyColor = "#b85c1a ";
    if (accuracyPercent >= 80) { accuracyText = "БЛЕСТЯЩЕ "; accuracyColor = "#c4a747 "; }
    else if (accuracyPercent >= 60) { accuracyText = "ХОРОШО "; accuracyColor = "#7cb342 "; }
    else if (accuracyPercent >= 40) { accuracyText = "УДОВЛЕТВОРИТЕЛЬНО "; accuracyColor = "#e8b84a "; }
    else if (accuracyPercent >= 20) { accuracyText = "ПЛОХО "; accuracyColor = "#b85c1a "; }

    const endingText = getEndingText(analysis, accuracyPercent);
    let endingTitle = "", endingColor = "";
    if (accuracyPercent === 100) { endingTitle = "ТКАНЬ ИСТОРИИ СОХРАНЕНА "; endingColor = "#f5e6c0 "; }
    else if (accuracyPercent <= 12) { endingTitle = "ВЫ ИЗГНАНЫ ИЗ ХРОНИК "; endingColor = "#6b2f0f "; }
    else if (accuracyPercent === 98) { endingTitle = "ПОЧТИ. НО НЕ ВПОЛНЕ. "; endingColor = "#b8a992 "; }
    else if (isPositive) {
        if (intensity >= 70) { endingTitle = "ВЕЛИКАЯ ПОБЕДА "; endingColor = "#c4a747 "; }
        else if (intensity >= 40) { endingTitle = "ДОСТОЙНЫЙ РЕЗУЛЬТАТ "; endingColor = "#7cb342 "; }
        else { endingTitle = "НЕПЛОХО... НО МАЛО "; endingColor = "#8a7a60 "; }
    } else {
        if (intensity >= 70) { endingTitle = "КАТАСТРОФА "; endingColor = "#b85c1a "; }
        else if (intensity >= 40) { endingTitle = "ПРОВАЛ "; endingColor = "#b85c1a "; }
        else { endingTitle = "ДОСАДНАЯ ОШИБКА "; endingColor = "#8a7a60 "; }
    }

    const box = DOM.gameOverScreen.querySelector('.game-over-box');
    const getStatClass = (val, type) => {
        if (type === 'epidemy') return val < 30 ? 'stat-good' : val > 50 ? 'stat-bad' : 'stat-mid';
        if (type === 'reputation') return val > 80 ? 'stat-good' : val < 50 ? 'stat-bad' : 'stat-mid';
        return val > 0 ? 'stat-good' : val < -50 ? 'stat-bad' : 'stat-mid';
    };
    box.innerHTML = `<div class="corner-bl"></div><div class="corner-br"></div><h2 class="final-title" style="color: ${endingColor};">${endingTitle}</h2><div class="final-epilogue"><p>${endingText}</p></div><div class="final-divider"><span class="divider-line"></span><span class="divider-icon">⚜</span><span class="divider-line"></span></div><div class="accuracy-block"><div class="accuracy-title">⚜ ИСТОРИЧЕСКАЯ ДОСТОВЕРНОСТЬ ⚜</div><div class="accuracy-percent" style="color: ${accuracyColor};">${accuracyPercent}%</div><div class="accuracy-desc">(${gameState.historicalAccuracy.correct} из ${gameState.historicalAccuracy.total} решений)</div></div><div class="final-stats-mini"><div class="final-stat-mini"><span class="stat-icon">🧪</span><span class="stat-value-mini ${getStatClass(gameState.stats.epidemy, 'epidemy')}">${gameState.stats.epidemy}</span><span class="stat-label-mini">Эпидемия</span></div><div class="final-stat-mini"><span class="stat-icon">👑</span><span class="stat-value-mini ${getStatClass(gameState.stats.reputation, 'reputation')}">${gameState.stats.reputation}</span><span class="stat-label-mini">Репутация</span></div><div class="final-stat-mini"><span class="stat-icon">🪙</span><span class="stat-value-mini ${getStatClass(gameState.stats.treasury, 'treasury')}">${gameState.stats.treasury}</span><span class="stat-label-mini">Казна</span></div></div><button class="restart-btn final-restart" id="restart-btn"><span class="restart-text">ПРОДОЛЖИТЬ ХРОНИКИ</span></button>`;
    DOM.gameOverScreen.style.display = 'flex';
}

function restartGame() {
    stopHeartbeat();
    gameState.currentQuestionIndex = 0;
    gameState.stats = { ...CONFIG.INITIAL_STATS };
    gameState.historicalAccuracy = { correct: 0, total: 0 };
    if (DOM.gameOverScreen) DOM.gameOverScreen.style.display = 'none';
    if (DOM.card) { DOM.card.style.display = ''; DOM.card.style.transition = 'none'; DOM.card.style.opacity = '1'; DOM.card.style.transform = 'translateX(0px) scale(1) rotate(0deg)'; DOM.card.style.pointerEvents = 'auto'; }
    DOM.leftLabel.style.opacity = 0; DOM.rightLabel.style.opacity = 0;
    updateTimelinePosition(); updateCardContent();
}

// ==========================================================================
// 10-12. МУЗЫКА, СЕРДЦЕБИЕНИЕ, ЭФФЕКТЫ
// ==========================================================================
function loadTrack(index) {
    if (index < 0) index = CONFIG.TRACKS.length - 1;
    if (index >= CONFIG.TRACKS.length) index = 0;
    gameState.currentTrackIndex = index;
    DOM.audio.src = CONFIG.TRACKS[index].url;
    DOM.trackNameSpan.textContent = CONFIG.TRACKS[index].name;
    if (!DOM.audio.paused) DOM.audio.play().catch(() => {});
}
function nextTrack() { loadTrack(gameState.currentTrackIndex + 1); DOM.audio.play().catch(() => {}); }
function prevTrack() { loadTrack(gameState.currentTrackIndex - 1); DOM.audio.play().catch(() => {}); }
function setVolume() {
    const v = DOM.volumeSlider.value / 100;
    DOM.audio.volume = v; DOM.volumeValue.textContent = `${DOM.volumeSlider.value}%`;
    DOM.volumeSlider.style.background = `linear-gradient(90deg, #d4b872 0%, #d4b872 ${DOM.volumeSlider.value}%, rgba(212, 184, 114, 0.15) ${DOM.volumeSlider.value}%)`;
    if (DOM.heartbeatSound) DOM.heartbeatSound.volume = v;
}

function startHeartbeat() {
    if (!DOM.heartbeatSound || gameState.isHeartbeatPlaying) return;
    
    // 1. Явно возобновляем музыку (борьба с автопаузой браузеров)
    if (DOM.audio.paused) DOM.audio.play().catch(() => {});

    // 2. Сохраняем текущую громкость и делаем ducking (приглушаем музыку на ~65%)
    gameState._musicVolBackup = gameState._musicVolBackup ?? DOM.audio.volume;
    DOM.audio.volume = Math.max(0.05, DOM.audio.volume * 0.35);

    // 3. Запускаем сердцебиение с оригинальной громкостью
    DOM.heartbeatSound.volume = gameState._musicVolBackup;
    DOM.heartbeatSound.currentTime = 0;
    DOM.heartbeatSound.play().catch(e => console.log('Heartbeat err:', e));
    
    gameState.isHeartbeatPlaying = true;
}

function stopHeartbeat() {
    if (!DOM.heartbeatSound || !gameState.isHeartbeatPlaying) return;
    
    DOM.heartbeatSound.pause();
    DOM.heartbeatSound.currentTime = 0;
    
    // 4. Возвращаем громкость музыки к исходному значению
    DOM.audio.volume = gameState._musicVolBackup || DOM.audio.volume;
    gameState.isHeartbeatPlaying = false;
}
function updateHeartbeat() {
    if (!DOM.heartbeatSound) return;
    const d = questions[gameState.currentQuestionIndex];
    const isRed = d && d.borderColor === 'red';
    if (isRed && !gameState.isHeartbeatPlaying) startHeartbeat();
    else if (!isRed && gameState.isHeartbeatPlaying) stopHeartbeat();
}

function createParticles() {
    if (!DOM.particlesContainer) return;
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div'); p.className = 'particle';
        const s = Math.random() * 3 + 2;
        p.style.width = p.style.height = s + 'px'; p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (Math.random() * 18 + 10) + 's'; p.style.animationDelay = '0s';
        DOM.particlesContainer.appendChild(p);
    }
}

let quoteIndex = 0, charIndex = 0, isDeleting = false;
function typeEffect() {
    if (!DOM.typewriterEl) return;
    const q = CONFIG.QUOTES[quoteIndex];
    if (!isDeleting) {
        DOM.typewriterEl.textContent = q.substring(0, charIndex + 1); charIndex++;
        if (charIndex === q.length) { isDeleting = true; setTimeout(typeEffect, 3200); return; }
    } else {
        DOM.typewriterEl.textContent = q.substring(0, charIndex - 1); charIndex--;
        if (charIndex === 0) { isDeleting = false; quoteIndex = (quoteIndex + 1) % CONFIG.QUOTES.length; }
    }
    setTimeout(typeEffect, isDeleting ? 30 : 58);
}

// ==========================================================================
// 13. МОДАЛЬНЫЕ ОКНА
// ==========================================================================
function openAboutModal() { if (!DOM.aboutModal) return; DOM.aboutModal.classList.add('visible'); document.body.style.overflow = 'hidden'; }
function closeAboutModal() { if (!DOM.aboutModal) return; DOM.aboutModal.classList.remove('visible'); setTimeout(() => document.body.style.overflow = '', 350); }
function openRulesModal() { if (!DOM.rulesModal) return; DOM.rulesModal.classList.add('visible'); document.body.style.overflow = 'hidden'; if (DOM.rulesBtn) DOM.rulesBtn.classList.remove('ui-visible'); }
function closeRulesModal() { if (!DOM.rulesModal) return; DOM.rulesModal.classList.remove('visible'); setTimeout(() => { document.body.style.overflow = ''; if (DOM.rulesBtn) DOM.rulesBtn.classList.add('ui-visible'); }, 350); }

// ==========================================================================
// 14-18. ИНИЦИАЛИЗАЦИЯ, СОБЫТИЯ, АДАПТИВНОСТЬ (Консолидировано)
// ==========================================================================
function initializeGame() {
    if (DOM.mainContent) DOM.mainContent.classList.add('main-content-hidden');
    if (DOM.card) { DOM.card.style.pointerEvents = 'none'; DOM.card.style.opacity = '1'; }
    createParticles(); createTimelineLabels(); preventImageDrag();
    setTimeout(typeEffect, 1200);
    loadTrack(0); DOM.audio.volume = 0.3; DOM.volumeSlider.value = 30; setVolume();
    DOM.audio.play().catch(e => console.log('Autoplay blocked'));
    const style = document.createElement('style');
    style.textContent = `.card-text, .character-name { transition: opacity 0.15s ease; } .card-image img { transition: opacity 0.2s ease; }`;
    document.head.appendChild(style);
}

function updateResponsiveConfig() {
    const w = window.innerWidth;
    let maxDrag = 150, thresh = 120, rot = 15, appear = 20, full = 100;
    if (w <= 320) { maxDrag = 45; thresh = 35; rot = 10; appear = 8; full = 30; }
    else if (w <= 360) { maxDrag = 55; thresh = 42; rot = 12; appear = 10; full = 38; }
    else if (w <= 380) { maxDrag = 65; thresh = 50; rot = 13; appear = 12; full = 45; }
    else if (w <= 420) { maxDrag = 72; thresh = 58; rot = 21; appear = 13; full = 50; }
    else if (w <= 480) { maxDrag = 80; thresh = 65; rot = 14; appear = 15; full = 60; }

    CONFIG.CARD.MAX_DRAG_DISTANCE = maxDrag; CONFIG.CARD.SWIPE_THRESHOLD = thresh;
    CONFIG.CARD.ROTATION_FACTOR = rot; CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = appear;
    CONFIG.CARD.CHOICE_FULL_OPACITY_AT = full;
    updateTimelinePosition();
}

// Глобальные слушатели (добавляются один раз)
if (DOM.playBtn) DOM.playBtn.addEventListener('click', () => {
    preloadAllImages();
    DOM.startScreen.style.transition = 'opacity 0.8s ease, visibility 0.8s ease';
    DOM.startScreen.style.opacity = '0';
    setTimeout(() => {
        DOM.startScreen.style.display = 'none'; DOM.startScreen.style.visibility = 'hidden';
        DOM.disclaimerScreen.style.display = 'flex'; DOM.disclaimerScreen.style.visibility = 'visible'; DOM.disclaimerScreen.style.opacity = '0';
        setTimeout(() => { DOM.disclaimerScreen.style.transition = 'opacity 0.8s ease'; DOM.disclaimerScreen.style.opacity = '1'; }, 50);
    }, 800);
});

if (DOM.continueBtn) DOM.continueBtn.addEventListener('click', (e) => { e.stopPropagation(); hideDisclaimerAndStart(); });
if (DOM.disclaimerScreen) DOM.disclaimerScreen.addEventListener('click', (e) => { if (!DOM.continueBtn.contains(e.target)) hideDisclaimerAndStart(); });

if (DOM.card) {
    DOM.card.addEventListener('mousedown', handleDragStart);
    DOM.card.addEventListener('touchstart', handleDragStart, { passive: false });
}
document.addEventListener('mousemove', handleDragMove);
document.addEventListener('touchmove', handleDragMove, { passive: false });
document.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchend', handleDragEnd);

if (DOM.playerIcon) DOM.playerIcon.addEventListener('click', () => { DOM.playerPanel.style.display = DOM.playerPanel.style.display === 'none' ? 'block' : 'none'; });
if (DOM.prevTrackBtn) DOM.prevTrackBtn.addEventListener('click', prevTrack);
if (DOM.nextTrackBtn) DOM.nextTrackBtn.addEventListener('click', nextTrack);
if (DOM.volumeSlider) DOM.volumeSlider.addEventListener('input', setVolume);
DOM.audio.addEventListener('ended', () => { DOM.audio.currentTime = 0; DOM.audio.play().catch(() => {}); });

if (DOM.aboutBtn) DOM.aboutBtn.addEventListener('click', openAboutModal);
if (DOM.closeAboutBtn) DOM.closeAboutBtn.addEventListener('click', closeAboutModal);
if (DOM.rulesBtn) DOM.rulesBtn.addEventListener('click', openRulesModal);
if (DOM.closeRulesBtn) DOM.closeRulesBtn.addEventListener('click', closeRulesModal);
if (DOM.aboutModal) DOM.aboutModal.addEventListener('click', (e) => { if (e.target === DOM.aboutModal) closeAboutModal(); });
if (DOM.rulesModal) DOM.rulesModal.addEventListener('click', (e) => { if (e.target === DOM.rulesModal) closeRulesModal(); });

document.addEventListener('click', (e) => { if (e.target.closest('.restart-btn')) { e.preventDefault(); e.stopPropagation(); restartGame(); } });
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (DOM.aboutModal?.classList.contains('visible')) closeAboutModal(); if (DOM.rulesModal?.classList.contains('visible')) closeRulesModal(); }
    // Dev Mode
    if (['f','F','а','А'].includes(e.key)) { gameState.stats = { epidemy: -50, reputation: -70, treasury: -30 }; gameState.historicalAccuracy = { correct: 51, total: 51 }; gameState.currentQuestionIndex = questions.length; if (DOM.card) DOM.card.style.display = 'none'; showFinalVerdict(); }
    if (['b','B','и','И'].includes(e.key)) { showBadEnd('Тестовый bad end', 'Нажата клавиша B'); }
});

// Консолидированный Resize/Orientation
let resizeTimer, configTimer;
const handleResize = () => { clearTimeout(resizeTimer); clearTimeout(configTimer); configTimer = setTimeout(updateResponsiveConfig, 150); };
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => setTimeout(updateResponsiveConfig, 300));

initializeGame();
setTimeout(() => { setVolume(); updateHeartbeat(); }, 100);
updateResponsiveConfig();
// ==========================================================================
// 19. АДАПТАЦИЯ ПЛАШЕК ВЫБОРА ДЛЯ МАЛЫХ ЭКРАНОВ (320×480)
// ==========================================================================
/**
 * На малых экранах MAX_DRAG_DISTANCE сильно уменьшен (45-55px вместо 150px),
 * поэтому стандартная формула opacity = moveX / 100 не работает —
 * плашка никогда не становится полностью непрозрачной (максимум 0.45).
 * 
 * Решение:
 * - Плашки появляются раньше (порог 10px вместо 20px)
 * - Полная непрозрачность достигается при 70% от MAX_DRAG_DISTANCE
 * - Затемнение идёт быстрее в начале движения
 */

// Добавляем новые параметры в CONFIG
CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 20;   // Порог появления (px)
CONFIG.CARD.CHOICE_FULL_OPACITY_AT = 100;   // При каком смещении opacity = 1

// Расширяем updateCardConfig для пересчёта параметров плашек
const _originalUpdateCardConfig = typeof updateCardConfig === 'function' 
    ? updateCardConfig 
    : null;

function updateCardConfigExtended() {
    // Вызываем оригинал (если он есть)
    if (_originalUpdateCardConfig) _originalUpdateCardConfig();
    
    const width = window.innerWidth;
    
    if (width <= 320) {
        // Экстремально узкие: плашка появляется почти сразу,
        // полная непрозрачность при 30px (66% от max 45px)
        CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 8;
        CONFIG.CARD.CHOICE_FULL_OPACITY_AT = 30;
    } else if (width <= 360) {
        // Малые экраны: появление при 10px, полная при 38px (70% от 55px)
        CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 10;
        CONFIG.CARD.CHOICE_FULL_OPACITY_AT = 38;
    } else if (width <= 480) {
        // Средние мобильные
        CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 15;
        CONFIG.CARD.CHOICE_FULL_OPACITY_AT = 60;
    } else {
        // Десктоп — стандарт
        CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 20;
        CONFIG.CARD.CHOICE_FULL_OPACITY_AT = 100;
    }
}

// Применяем расширенную версию
updateCardConfigExtended();
window.removeEventListener('resize', window.cardConfigResizeHandler);
window.cardConfigResizeHandler = () => {
    clearTimeout(window.cardConfigResizeTimer);
    window.cardConfigResizeTimer = setTimeout(updateCardConfigExtended, 150);
};
window.addEventListener('resize', window.cardConfigResizeHandler);
window.addEventListener('orientationchange', () => {
    setTimeout(updateCardConfigExtended, 300);
});

// ==========================================================================
// ПЕРЕХВАТЧИК: корректирует opacity плашек ПОСЛЕ оригинального обработчика
// ==========================================================================
/**
 * Работает как "патч поверх" — не ломает оригинальный handleDragMove,
 * а только пересчитывает прозрачность плашек для малых экранов.
 */
function patchChoiceLabelsOpacity(e) {
    if (!gameState.isDragging) return;
    
    // На больших экранах ничего не меняем
    if (window.innerWidth > 480) return;
    
    const currentX = e.touches ? e.touches[0].clientX : e.clientX;
    const moveX = currentX - gameState.startX;
    const absMove = Math.abs(moveX);
    
    const appearAt = CONFIG.CARD.CHOICE_APPEAR_THRESHOLD;
    const fullAt = CONFIG.CARD.CHOICE_FULL_OPACITY_AT;
    
    // Нелинейная формула: быстрый рост в начале, плавное насыщение
    // Используем ease-out кривую для приятного визуального эффекта
    let opacity = 0;
    if (absMove > appearAt) {
        const progress = (absMove - appearAt) / (fullAt - appearAt);
        // easeOutQuad: 1 - (1 - t)^2 — быстро растёт вначале
        const eased = 1 - Math.pow(1 - Math.min(progress, 1), 2);
        opacity = eased;
    }
    
    // Применяем к нужной плашке в зависимости от направления
    if (moveX > appearAt) {
        if (DOM.rightLabel) DOM.rightLabel.style.opacity = opacity;
        if (DOM.leftLabel) DOM.leftLabel.style.opacity = 0;
    } else if (moveX < -appearAt) {
        if (DOM.leftLabel) DOM.leftLabel.style.opacity = opacity;
        if (DOM.rightLabel) DOM.rightLabel.style.opacity = 0;
    } else {
        if (DOM.leftLabel) DOM.leftLabel.style.opacity = 0;
        if (DOM.rightLabel) DOM.rightLabel.style.opacity = 0;
    }
}

// Подписываемся на те же события ПОСЛЕ оригинальных обработчиков.
// Браузер вызывает их в порядке добавления, поэтому наш сработает
// после handleDragMove и перезапишет opacity своими значениями.
document.addEventListener('mousemove', patchChoiceLabelsOpacity);
document.addEventListener('touchmove', patchChoiceLabelsOpacity, { passive: true });

// ==========================================================================
// 20. ПАТЧ АДАПТАЦИИ ДЛЯ 375px (iPhone 6/7/8, X/11/12/13)
// Безопасно модифицирует CONFIG.CARD на лету. Не затрагивает основной код.
// ==========================================================================
(function() {
    function apply375Adaptation() {
        const w = window.innerWidth;
        if (w > 360 && w <= 380) {
            CONFIG.CARD.MAX_DRAG_DISTANCE = 65;
            CONFIG.CARD.SWIPE_THRESHOLD   = 50;
            CONFIG.CARD.ROTATION_FACTOR   = 13;
            
            CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 12;
            CONFIG.CARD.CHOICE_FULL_OPACITY_AT  = 45;
        }
    }

    apply375Adaptation();

    let timer375;
    const handler375 = () => {
        clearTimeout(timer375);
        timer375 = setTimeout(apply375Adaptation, 150);
    };
    window.addEventListener('resize', handler375);
    window.addEventListener('orientationchange', () => setTimeout(apply375Adaptation, 300));
})();

// ==========================================================================
// 21. ПАТЧ АДАПТАЦИИ ДЛЯ 414px (iPhone 8 Plus, XR, Pro Max)
// Безопасно модифицирует CONFIG.CARD на лету. Не затрагивает основной код.
// ==========================================================================
(function() {
    function apply414Adaptation() {
        const w = window.innerWidth;
        // Срабатывает ТОЛЬКО для диапазона 414px
        if (w > 380 && w <= 420) {
            // Физика карточки: интерполяция между 375px и 480px
            CONFIG.CARD.MAX_DRAG_DISTANCE = 72;   // Безопасный предел свайпа
            CONFIG.CARD.SWIPE_THRESHOLD   = 58;   // Порог фиксации выбора
            CONFIG.CARD.ROTATION_FACTOR   = 21;   // Угол поворота (~5.5° макс)
            
            // Параметры плашек: синхронизированы с CSS
            CONFIG.CARD.CHOICE_APPEAR_THRESHOLD = 13;
            CONFIG.CARD.CHOICE_FULL_OPACITY_AT  = 50;
        }
    }

    // Применяем сразу при загрузке
    apply414Adaptation();

    // Подписываемся на ресайз/поворот с debounce (не удаляя оригинальные слушатели)
    let timer414;
    const handler414 = () => {
        clearTimeout(timer414);
        timer414 = setTimeout(apply414Adaptation, 150);
    };
    window.addEventListener('resize', handler414);
    window.addEventListener('orientationchange', () => setTimeout(apply414Adaptation, 300));
})();

