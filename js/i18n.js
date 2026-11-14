// S.E.R.A — Safe Exploration & Return Assistant
// Written with AI assistance (Claude), reviewed by team VAA.
// i18n.js: English / Русский / O'zbekcha. The pages are written in English; this module swaps
// the visible text for Russian or Uzbek (Latin) with a phrase dictionary, also for text the app
// writes later (plan, verdict, helmet view, popups), and keeps the English original to switch
// back. The choice is saved in the browser ('sera-lang'); ?lang=ru|en also works.
// Translations were drafted by AI: the team checks the Russian and the Uzbek.

(function (root) {
  'use strict';

  var LANGS = ['en', 'ru'];     // Uzbek removed by the team (14.11); its column stays in D for later
  var KEY = 'sera-lang';

  // [English, Русский, O'zbekcha]. Phrases of two or more words are replaced inside longer text;
  // one-word entries only when they are the whole text of an element.
  var D = [
    // ---- header, map buttons, legend ----
    ['Mission Planner', 'Планировщик миссии', 'Missiya rejalashtiruvchisi'],
    ['Find a place on Mars', 'Найти место на Марсе', 'Marsda joy topish'],
    ['Our EVA zone', 'Наша зона EVA', 'Bizning EVA hududimiz'],
    ['Rover position in our data', 'Положение марсохода в наших данных', 'Ma\'lumotlarimizdagi marsoxod joyi'],
    ['Mars turning, made from NASA Viking and MOLA data, with the name S.E.R.A', 'Вращающийся Марс по данным NASA Viking и MOLA с названием S.E.R.A', 'NASA Viking va MOLA ma\'lumotlaridan aylanayotgan Mars, S.E.R.A nomi bilan'],
    ['Mars 3D', 'Марс 3D', 'Mars 3D'],
    ['Gale Crater', 'Кратер Гейл', 'Geyl krateri'],
    ['EVA zone', 'Зона EVA', 'EVA hududi'],
    ['Curiosity', 'Curiosity', 'Curiosity'],
    ['Radio', 'Радио', 'Radio'],
    ['Minerals', 'Минералы', 'Minerallar'],
    ['Demo', 'Демо', 'Demo'],
    ['Tour', 'Тур', 'Tur'],
    ['2D map', '2D-карта', '2D xarita'],
    ['Route out', 'Маршрут туда', 'Borish yo\'li'],
    ['Way home', 'Путь домой', 'Uyga yo\'l'],
    ['Slope 15–25° · caution', 'Уклон 15–25° · осторожно', 'Qiyalik 15–25° · ehtiyot'],
    ['Slope over 25° · no-go', 'Уклон больше 25° · нельзя', 'Qiyalik 25° dan ortiq · mumkin emas'],
    ['EVA zone 2 × 2 km', 'Зона EVA 2 × 2 км', 'EVA hududi 2 × 2 km'],
    ['Base', 'База', 'Baza'],
    ['Science point', 'Научная точка', 'Ilmiy nuqta'],
    ['No radio to base', 'Нет радиосвязи с базой', 'Baza bilan radioaloqa yo\'q'],
    ['Curiosity path ·', 'Путь Curiosity ·', 'Curiosity yo\'li ·'],
    ['photo', 'фото', 'surat'],
    ['Sulfates', 'Сульфаты', 'Sulfatlar'],
    ['Mono-sulfates', 'Моносульфаты', 'Monosulfatlar'],
    ['Clays', 'Глины', 'Gillar'],
    ['Al-clays / silica', 'Al-глины / кремнезём', 'Al-gillar / kremnezyom'],
    ['Elevation along the route · 1 m DEM', 'Высота вдоль маршрута · DEM 1 м', 'Yo\'nalish bo\'ylab balandlik · DEM 1 m'],
    ['Map scale', 'Масштаб карты', 'Xarita masshtabi'],
    ['CTX · Gale Crater (6 m)', 'CTX · кратер Гейл (6 м)', 'CTX · Geyl krateri (6 m)'],
    ['HiRISE · Curiosity site (25 cm)', 'HiRISE · место Curiosity (25 см)', 'HiRISE · Curiosity joyi (25 sm)'],
    ['Slopes · 1 m DEM (15° / 25°)', 'Уклоны · DEM 1 м (15° / 25°)', 'Qiyaliklar · DEM 1 m (15° / 25°)'],
    ['Geology · USGS SIM 3292', 'Геология · USGS SIM 3292', 'Geologiya · USGS SIM 3292'],
    ['Thermal · THEMIS night IR', 'Тепло · THEMIS, ночной ИК', 'Issiqlik · THEMIS tungi IQ'],
    ['Map of Mars', 'Карта Марса', 'Mars xaritasi'],
    ['Map legend', 'Легенда карты', 'Xarita shartli belgilari'],
    ['3D model of Mars', '3D-модель Марса', 'Marsning 3D modeli'],
    ['Show the real path of the Curiosity rover', 'Показать настоящий путь марсохода Curiosity', 'Curiosity marsoxodining haqiqiy yo\'lini ko\'rsatish'],
    ['Show where the base radio cannot reach', 'Показать, куда не достаёт радио базы', 'Baza radiosi yetmaydigan joylarni ko\'rsatish'],
    ['Mineral signals from MRO CRISM', 'Сигналы минералов по MRO CRISM', 'MRO CRISM bo\'yicha mineral signallari'],
    ['One-minute guided tour', 'Тур на одну минуту', 'Bir daqiqalik tur'],
    ['Switch to light theme', 'Светлая тема', 'Yorug\' mavzu'],
    ['Switch to dark theme', 'Тёмная тема', 'Qorong\'i mavzu'],
    ['Elevation profile of the route', 'Профиль высот маршрута', 'Yo\'nalish balandlik profili'],
    ['Mineral signals, MRO CRISM', 'Сигналы минералов, MRO CRISM', 'Mineral signallari, MRO CRISM'],
    ['Save the maps for use without internet', 'Сохранить карты для работы без интернета', 'Xaritalarni internetsiz ishlash uchun saqlash'],

    // ---- panel: Mars now ----
    ['Mars now · EVA zone', 'Марс сейчас · зона EVA', 'Mars hozir · EVA hududi'],
    ['Local solar time', 'Местное солнечное время', 'Mahalliy quyosh vaqti'],
    ['Curiosity mission sol', 'Сол миссии Curiosity', 'Curiosity missiyasi soli'],
    ['Season (L', 'Сезон (L', 'Fasl (L'],
    ['Sunrise – sunset', 'Восход – закат', 'Quyosh chiqishi – botishi'],
    ['Daylight left', 'Осталось светлого времени', 'Qolgan yorug\' vaqt'],
    ['Air temperature, typical', 'Температура воздуха, обычно', 'Havo harorati, odatda'],
    ['Ground temperature', 'Температура грунта', 'Grunt harorati'],
    ['Pressure', 'Давление', 'Bosim'],
    ['Curiosity REMS, mean of', 'Curiosity REMS, среднее за', 'Curiosity REMS, o\'rtacha:'],
    ['sols at this season', 'солов в этот сезон', 'sol, shu faslda'],
    ['Night at the EVA zone', 'В зоне EVA ночь', 'EVA hududida tun'],

    // ---- panel: plan ----
    ['EVA plan', 'План EVA', 'EVA rejasi'],
    ['All checks passed', 'Все проверки пройдены', 'Barcha tekshiruvlardan o\'tdi'],
    ['Click inside the EVA zone to place the base (habitat).', 'Нажмите внутри зоны EVA, чтобы поставить базу (жилой модуль).', 'Bazani (yashash moduli) qo\'yish uchun EVA hududi ichiga bosing.'],
    ['Click inside the dashed EVA zone.', 'Нажмите внутри пунктирной зоны EVA.', 'Punktirli EVA hududi ichiga bosing.'],
    ['Base is set. Click to add science points.', 'База поставлена. Нажимайте, чтобы добавить научные точки.', 'Baza qo\'yildi. Ilmiy nuqtalar qo\'shish uchun bosing.'],
    ['Points are visited in the fastest order. Copper: route out. Mint dashed: way home.', 'Точки обходятся в самом быстром порядке. Медная линия — маршрут туда. Мятный пунктир — путь домой.', 'Nuqtalar eng tez tartibda aylanib chiqiladi. Mis rang — borish yo\'li. Yalpiz punktir — uyga yo\'l.'],
    ['Some points cannot be reached on safe slopes.', 'До некоторых точек нельзя дойти по безопасным склонам.', 'Ba\'zi nuqtalarga xavfsiz qiyaliklar orqali yetib bo\'lmaydi.'],
    ['Too steep here', 'Здесь слишком круто', 'Bu yer juda tik'],
    ['Pick another spot.', 'Выберите другое место.', 'Boshqa joyni tanlang.'],
    ['No safe way home from this spot. Pick another one.', 'Отсюда нет безопасного пути домой. Выберите другое место.', 'Bu yerdan uyga xavfsiz yo\'l yo\'q. Boshqa joyni tanlang.'],
    ['EVA start · local solar time', 'Начало EVA · местное солнечное время', 'EVA boshlanishi · mahalliy quyosh vaqti'],
    ['Now', 'Сейчас', 'Hozir'],
    ['start and finish · elev', 'старт и финиш · высота', 'start va finish · balandlik'],
    ['home from here', 'домой отсюда', 'bu yerdan uyga'],
    ['no safe path', 'нет безопасного пути', 'xavfsiz yo\'l yo\'q'],
    ['leg ', 'участок ', 'qism '],
    ['Remove', 'Убрать', 'Olib tashlash'],
    ['EVA time', 'Время EVA', 'EVA vaqti'],
    ['Walking ·', 'Ходьба ·', 'Piyoda ·'],
    ['Science work ·', 'Научная работа ·', 'Ilmiy ish ·'],
    ['Suit limit ·', 'Лимит скафандра ·', 'Skafandr chegarasi ·'],
    ['% reserve', '% резерв', '% zaxira'],
    ['Margin', 'Запас', 'Zaxira'],
    ['over by', 'не хватает', 'yetmaydi:'],
    ['Base (home) · habitat', 'База (дом) · жилой модуль', 'Baza (uy) · yashash moduli'],
    ['Your base', 'Ваша база', 'Sizning bazangiz'],
    ['Map view', 'Вид карты', 'Map view'],
    ['3D view', '3D-вид', '3D view'],
    ['Swipe to look around · double-tap: straight ahead', 'Проведите пальцем, чтобы осмотреться · двойное касание: вперёд', 'Swipe to look around · double-tap: straight ahead'],
    ['Drag to look around · double-click: straight ahead', 'Тяните, чтобы осмотреться · двойной клик: вперёд', 'Drag to look around · double-click: straight ahead'],
    ['3D: real terrain, 5 m grid (MODEL) · rocks are drawn for the look, not from the data', '3D: настоящий рельеф, сетка 5 м (МОДЕЛЬ) · камни нарисованы для вида, их нет в данных', '3D: real terrain, 5 m grid (MODEL) · rocks are drawn for the look, not from the data'],
    ['1 s = 10 s', '1 с = 10 с', '1 s = 10 s'],
    ['H · Base', 'H · База', 'H · Base'],
    ['REMS · historical data', 'REMS · исторические данные', 'REMS · historical data'],
    ['Air temperature', 'Температура воздуха', 'Air temperature'],
    ['Drag to move the base', 'Перетащите, чтобы сдвинуть базу', 'Drag to move the base'],
    ['Drag to move this point', 'Перетащите, чтобы сдвинуть точку', 'Drag to move this point'],
    ['The base stays where it was', 'База осталась на месте', 'The base stays where it was'],
    ['The point stays where it was', 'Точка осталась на месте', 'The point stays where it was'],
    ['That is outside the dashed 2 × 2 km EVA zone.', 'Это за пределами пунктирной зоны выхода 2 × 2 км.', 'That is outside the dashed 2 × 2 km EVA zone.'],
    ['There is no safe way home from that spot.', 'Оттуда нет безопасного пути домой.', 'There is no safe way home from that spot.'],
    ['Drop it on grey or yellow ground inside the zone.', 'Отпустите её на серой или жёлтой земле внутри зоны.', 'Drop it on grey or yellow ground inside the zone.'],
    ['Show', 'Показать', 'Show'],
    ['Remove the farthest point', 'Убрать самую дальнюю точку', 'Remove the farthest point'],
    ['Remove this point', 'Убрать эту точку', 'Remove this point'],
    ['Compare routes', 'Сравнить маршруты', 'Compare routes'],
    ['Start at 09:00', 'Начать в 09:00', 'Start at 09:00'],
    ['Show radio map', 'Показать карту связи', 'Show radio map'],
    ['GO · all checks passed', 'GO · все проверки пройдены', 'GO · all checks passed'],
    ['CAUTION · steep ground', 'CAUTION · крутые склоны', 'CAUTION · steep ground'],
    ['NO-GO · too long for one suit', 'NO-GO · слишком долго для одного скафандра', 'NO-GO · too long for one suit'],
    ['CAUTION · little spare air', 'CAUTION · мало запаса воздуха', 'CAUTION · little spare air'],
    ['NO-GO · start before sunrise', 'NO-GO · старт до восхода', 'NO-GO · start before sunrise'],
    ['NO-GO · back after dark', 'NO-GO · возвращение в темноте', 'NO-GO · back after dark'],
    ['CAUTION · close to sunset', 'CAUTION · близко к закату', 'CAUTION · close to sunset'],
    ['NO-GO · solar storm', 'NO-GO · солнечная буря', 'NO-GO · solar storm'],
    ['CAUTION · solar flare', 'CAUTION · солнечная вспышка', 'CAUTION · solar flare'],
    ['CAUTION · no space weather data', 'CAUTION · нет данных о космической погоде', 'CAUTION · no space weather data'],
    ['CAUTION · radio gaps', 'CAUTION · пропуски связи', 'CAUTION · radio gaps'],
    ['Ready? Walk it in the helmet view.', 'Готовы? Пройдите его в шлеме.', 'Ready? Walk it in the helmet view.'],
    ['Every way there crosses slopes over 25° (red on the map).', 'Любой путь туда идёт через склоны круче 25° (красные на карте).', 'Every way there crosses slopes over 25° (red on the map).'],
    ['Move the point to grey or yellow ground, or remove it.', 'Перенесите точку на серую или жёлтую землю или уберите её.', 'Move the point to grey or yellow ground, or remove it.'],
    ['You can go, slowly. Mission Twin looks for a gentler way.', 'Идти можно, но медленно. Mission Twin поищет путь положе.', 'You can go, slowly. Mission Twin looks for a gentler way.'],
    ['Start at 09:00 or later.', 'Начните в 09:00 или позже.', 'Start at 09:00 or later.'],
    ['Start earlier, or remove a point.', 'Начните раньше или уберите точку.', 'Start earlier, or remove a point.'],
    ['Solar particle event (simulated). Outside, the radiation dose is too high.', 'Поток солнечных частиц (симуляция). Снаружи доза радиации слишком высокая.', 'Solar particle event (simulated). Outside, the radiation dose is too high.'],
    ['Stay in the base. Stop the simulation to see the normal verdict.', 'Оставайтесь на базе. Остановите симуляцию, чтобы увидеть обычный вердикт.', 'Stay in the base. Stop the simulation to see the normal verdict.'],
    ['Stay in the base until 48 h after the event.', 'Оставайтесь на базе 48 ч после события.', 'Stay in the base until 48 h after the event.'],
    ['Go only with the shelter close, and watch for new alerts.', 'Выходите только недалеко от укрытия и следите за новыми тревогами.', 'Go only with the shelter close, and watch for new alerts.'],
    ['I could not load live NASA and NOAA data.', 'Не получилось загрузить живые данные NASA и NOAA.', 'I could not load live NASA and NOAA data.'],
    ['Check space weather before going out.', 'Проверьте космическую погоду перед выходом.', 'Check space weather before going out.'],
    ['Walk in pairs and keep your buddy in sight: the buddy relays.', 'Идите парой и держите напарника в поле зрения: он передаёт связь.', 'Walk in pairs and keep your buddy in sight: the buddy relays.'],
    ['Follow the mint line home, now.', 'Идите по мятной линии домой, сейчас.', 'Follow the mint line home, now.'],
    ['Follow the new line on the map.', 'Идите по новой линии на карте.', 'Follow the new line on the map.'],
    ['Back to the S.E.R.A site', 'Назад на сайт S.E.R.A', 'Back to the S.E.R.A site'],
    ['Site', 'Сайт', 'Site'],
    ['Mission Twin · compare 2 routes', 'Mission Twin · сравнить 2 маршрута', 'Mission Twin · compare 2 routes'],
    ['Route A · fastest', 'Маршрут A · быстрый', 'Route A · fastest'],
    ['Route B · gentle', 'Маршрут B · пологий', 'Route B · gentle'],
    ['Distance (there and back)', 'Расстояние (туда и обратно)', 'Distance (there and back)'],
    ['Steep ground 15–25°', 'Крутые участки 15–25°', 'Steep ground 15–25°'],
    ['Steepest step', 'Самый крутой шаг', 'Steepest step'],
    ['Time there', 'Время туда', 'Time there'],
    ['Time back', 'Время обратно', 'Time back'],
    ['Recommendation', 'Рекомендация', 'Recommendation'],
    ['= same route', '= маршрут один', '= same route'],
    ['✓ S.E.R.A picks this', '✓ S.E.R.A выбирает этот', '✓ S.E.R.A picks this'],
    ['Route B does not avoid enough steep ground to be worth the extra time. Route A is the better choice.', 'Маршрут B обходит слишком мало крутых участков, чтобы тратить лишнее время. Маршрут A лучше.', 'Route B does not avoid enough steep ground to be worth the extra time. Route A is the better choice.'],
    ['MODEL · Route B: 15–25° slopes cost 8× · solid: there, dashed: back · S.E.R.A is an AI-generated character', 'МОДЕЛЬ · Маршрут B: уклоны 15–25° стоят в 8 раз дороже · сплошная: туда, пунктир: обратно · S.E.R.A — персонаж, созданный ИИ', 'MODEL · Route B: 15–25° slopes cost 8× · solid: there, dashed: back · S.E.R.A is an AI-generated character'],
    ['S.E.R.A · AI assistant', 'S.E.R.A · ИИ-ассистент', 'S.E.R.A · AI assistant'],
    ['S.E.R.A is an AI-generated character', 'S.E.R.A — персонаж, созданный ИИ', 'S.E.R.A is an AI-generated character'],
    ['Ask S.E.R.A', 'Спросить S.E.R.A', 'Ask S.E.R.A'],
    ['I plan safe walks on Mars', 'Я планирую безопасные выходы на Марсе', 'I plan safe walks on Mars'],
    ['S.E.R.A plans an EVA on the real terrain of Gale Crater, checks slopes, suit time, daylight and space weather, and always keeps the way home. Start the mission, or watch the 1-minute tour.', 'S.E.R.A планирует выход по настоящему рельефу кратера Гейл, проверяет уклоны, время скафандра, свет и космическую погоду и всегда держит путь домой. Начните миссию или посмотрите тур на 1 минуту.', 'S.E.R.A plans an EVA on the real terrain of Gale Crater, checks slopes, suit time, daylight and space weather, and always keeps the way home. Start the mission, or watch the 1-minute tour.'],
    ['Let’s plan an EVA', 'Давайте спланируем выход', 'Let’s plan an EVA'],
    ['Click inside the dashed 2 × 2 km zone to place the base (H). Or press Demo to see a ready plan.', 'Нажмите внутри пунктирной зоны 2 × 2 км, чтобы поставить базу (H). Или нажмите «Демо», чтобы увидеть готовый план.', 'Click inside the dashed 2 × 2 km zone to place the base (H). Or press Demo to see a ready plan.'],
    ['Base is set', 'База поставлена', 'Base is set'],
    ['Now click to add science points. I will find the safe path, the fastest order and the way home.', 'Теперь кликами добавьте научные точки. Я найду безопасный путь, быстрый порядок и дорогу домой.', 'Now click to add science points. I will find the safe path, the fastest order and the way home.'],
    ['Show me how', 'Покажи, как', 'Show me how'],
    ['Checking…', 'Проверяю…', 'Checking…'],
    ['Checking the plan…', 'Проверяю план…', 'Checking the plan…'],
    ['Slopes, suit time, daylight, space weather.', 'Уклоны, время скафандра, свет, космическая погода.', 'Slopes, suit time, daylight, space weather.'],
    ['science points, farthest point', 'научных точек, самая дальняя —', 'science points, farthest point'],
    ['from home.', 'от дома.', 'from home.'],
    ['Spare suit time', 'Запас скафандра', 'Spare suit time'],
    ['Too long for one suit: split into several EVAs.', 'Слишком долго для одного скафандра: разбейте на несколько выходов.', 'Too long for one suit: split into several EVAs.'],
    ['Welcome back!', 'С возвращением!', 'Welcome back!'],
    ['EVA complete, you are back at the base.', 'Выход завершён, вы на базе.', 'EVA complete, you are back at the base.'],
    ['NO-GO: turn back now', 'NO-GO: возвращайтесь сейчас', 'NO-GO: turn back now'],
    ['Solar particle alert. I rebuilt the fastest safe way home from where you stand.', 'Тревога солнечных частиц. Я перестроила самый быстрый безопасный путь домой от того места, где вы стоите.', 'Solar particle alert. I rebuilt the fastest safe way home from where you stand.'],
    ['You left the route', 'Вы сошли с маршрута', 'You left the route'],
    ['No problem: here is a new safe path to the next point. The rest of the plan stays.', 'Не страшно: вот новый безопасный путь к следующей точке. Остальной план не меняется.', 'No problem: here is a new safe path to the next point. The rest of the plan stays.'],
    ['Hi, I’m S.E.R.A', 'Привет, я S.E.R.A', 'Hi, I’m S.E.R.A'],
    ['Your assistant for walks on Mars. In 7 short steps I’ll show how to plan an EVA that always brings you home.', 'Ваш ассистент для выходов на Марсе. За 7 коротких шагов покажу, как спланировать выход, который всегда возвращает домой.', 'Your assistant for walks on Mars. In 7 short steps I’ll show how to plan an EVA that always brings you home.'],
    ['1 · Start on Mars', '1 · Начните с Марса', '1 · Start on Mars'],
    ['The real planet from NASA data. Turn it and pick Gale Crater: our EVA zone is there. Zoom in close and the flat map opens.', 'Настоящая планета по данным NASA. Поверните её и выберите кратер Гейл: там наша зона выхода. Приблизьте — откроется плоская карта.', 'The real planet from NASA data. Turn it and pick Gale Crater: our EVA zone is there. Zoom in close and the flat map opens.'],
    ['2 · Base and science points', '2 · База и научные точки', '2 · Base and science points'],
    ['Inside the dashed 2 × 2 km zone the first click places the base (H), every next click a science point. Missed a bit? Drag the marker. Red slopes are too steep. Here is a demo plan.', 'В пунктирной зоне 2 × 2 км первый клик ставит базу (H), каждый следующий — научную точку. Чуть промахнулись? Перетащите метку. Красные склоны слишком крутые. Вот демо-план.', 'Inside the dashed 2 × 2 km zone the first click places the base (H), every next click a science point. Missed a bit? Drag the marker. Red slopes are too steep. Here is a demo plan.'],
    ['3 · Find a place', '3 · Найдите место', '3 · Find a place'],
    ['Type a crater name, “Curiosity” or “base”: the map flies there.', 'Введите название кратера, «Curiosity» или «база» — карта перелетит туда.', 'Type a crater name, “Curiosity” or “base”: the map flies there.'],
    ['4 · The verdict', '4 · Вердикт', '4 · The verdict'],
    ['I check slopes, suit time, daylight, radio and space weather. GO, CAUTION or NO-GO, always with the reason.', 'Я проверяю уклоны, время скафандра, свет, связь и космическую погоду. GO, CAUTION или NO-GO — всегда с причиной.', 'I check slopes, suit time, daylight, radio and space weather. GO, CAUTION or NO-GO, always with the reason.'],
    ['5 · Your route', '5 · Ваш маршрут', '5 · Your route'],
    ['Stop by stop: how long the walk is, and the time home from every point. The dashed mint line is the fastest way back.', 'Точка за точкой: сколько идти и сколько от каждой точки до дома. Мятный пунктир — самый быстрый путь назад.', 'Stop by stop: how long the walk is, and the time home from every point. The dashed mint line is the fastest way back.'],
    ['6 · Walk it in the helmet', '6 · Пройдите его в шлеме', '6 · Walk it in the helmet'],
    ['Play the EVA from inside the helmet. I watch the walk: off the route I find a new path, in a storm I lead you home.', 'Пройдите выход изнутри шлема. Я слежу за прогулкой: сойдёте с маршрута — найду новый путь, буря — отведу домой.', 'Play the EVA from inside the helmet. I watch the walk: off the route I find a new path, in a storm I lead you home.'],
    ['7 · Ask me any time', '7 · Спрашивайте в любой момент', '7 · Ask me any time'],
    ['Press my button and I explain the current plan. Ready?', 'Нажмите мою кнопку — я объясню текущий план. Готовы?', 'Press my button and I explain the current plan. Ready?'],
    ['Keep the demo', 'Оставить демо', 'Keep the demo'],
    ['Start →', 'Начать →', 'Start →'],
    ['← Back', '← Назад', '← Back'],
    ['Skip', 'Пропустить', 'Skip'],
    ['Later', 'Позже', 'Later'],
    ['Your assistant for safe walks on Mars. I plan the route on real terrain and always keep the way home.', 'Ваш ассистент для безопасных выходов на Марсе. Я прокладываю маршрут по настоящему рельефу и всегда держу путь домой.', 'Your assistant for safe walks on Mars. I plan the route on real terrain and always keep the way home.'],
    ['Test · off route', 'Тест · сход с маршрута', 'Test · off route'],
    ['Test · storm alert', 'Тест · тревога бури', 'Test · storm alert'],
    ['Solar particle alert (test): NO-GO, new fastest way home from here', 'Тревога солнечных частиц (тест): NO-GO, новый быстрейший путь домой отсюда', 'Solar particle alert (test): NO-GO, new fastest way home from here'],
    ['Off route', 'Сход с маршрута', 'Off route'],
    ['Base · start', 'База · старт', 'Baza · start'],
    ['Base · back', 'База · возвращение', 'Baza · qaytish'],
    ['habitat · elev', 'жилой модуль · высота', 'yashash moduli · balandlik'],
    ['min science work · home from here', 'мин научной работы · отсюда домой', 'daq ilmiy ish · bu yerdan uyga'],
    ['whole EVA', 'весь выход', 'butun EVA'],
    ['Time home from here', 'Время до дома отсюда', 'Bu yerdan uyga vaqt'],
    ['No safe path', 'Нет безопасного пути', 'No safe path'],
    ['map files saved. Saving cancelled.', 'файлов карты сохранено. Сохранение отменено.', 'xarita fayli saqlandi. Saqlash bekor qilindi.'],
    ['Click to cancel', 'Нажмите, чтобы отменить', 'Bekor qilish uchun bosing'],
    ['Cancel', 'Отмена', 'Bekor qilish'],
    ['Slopes', 'Уклоны', 'Qiyaliklar'],
    ['Suit time', 'Время скафандра', 'Skafandr vaqti'],
    ['Daylight', 'Светлое время', 'Yorug\' vaqt'],
    ['Space weather', 'Космическая погода', 'Kosmik ob-havo'],
    ['Radio contact', 'Радиосвязь', 'Radioaloqa'],
    ['Radiation', 'Радиация', 'Radiatsiya'],
    ['Dust season', 'Пыльный сезон', 'Chang fasli'],
    ['whole route under 15°', 'весь маршрут на уклонах меньше 15°', 'butun yo\'l 15° dan past qiyalikda'],
    ['a science point has no safe path (slopes over 25°)', 'к научной точке нет безопасного пути (уклоны больше 25°)', 'ilmiy nuqtaga xavfsiz yo\'l yo\'q (qiyalik 25° dan ortiq)'],
    ['m of the route is on 15–25° slopes', 'м маршрута на уклонах 15–25°', 'm yo\'l 15–25° qiyalikda'],
    ['plan is', 'план на', 'reja'],
    ['longer than the suit limit with reserve', 'длиннее лимита скафандра с резервом', 'zaxirali skafandr chegarasidan uzun'],
    ['of spare suit time', 'запаса времени скафандра', 'skafandr vaqti zaxirasi'],
    ['spare before the reserve', 'запаса до резерва', 'zaxiragacha bo\'sh vaqt'],
    ['only ', 'всего ', 'faqat '],
    ['is before sunrise', 'раньше восхода', 'quyosh chiqishidan oldin'],
    ['start at', 'старт в', 'start:'],
    ['back home at', 'возвращение домой в', 'uyga qaytish:'],
    ['after sunset', 'после заката', 'quyosh botgandan keyin'],
    ['less than 1 h before sunset', 'меньше чем за 1 ч до заката', 'quyosh botishiga 1 soatdan kam qolganda'],
    ['sunset at', 'закат в', 'quyosh botishi:'],
    ['solar particle event', 'солнечное протонное событие', 'quyosh zarrachalari hodisasi'],
    ['X-class solar flare', 'солнечная вспышка класса X', 'X sinf quyosh chaqnashi'],
    [' h ago', ' ч назад', ' soat oldin'],
    ['(simulated)', '(симуляция)', '(simulyatsiya)'],
    ['no particle events in 48 h', 'протонных событий за 48 ч нет', '48 soatda zarracha hodisalari yo\'q'],
    ['no X flares in 24 h', 'вспышек X за 24 ч нет', '24 soatda X chaqnashlari yo\'q'],
    ['no live data: check before going out', 'нет живых данных: проверьте перед выходом', 'jonli ma\'lumot yo\'q: chiqishdan oldin tekshiring'],
    ['in a row out of sight of the base mast: keep your buddy in sight, the buddy relays', 'подряд вне видимости мачты базы: держите напарника в поле зрения, он ретранслирует', 'ketma-ket baza ustuni ko\'rinmaydi: sherigingizni ko\'zdan qochirmang, u signalni uzatadi'],
    ['longest gap', 'самый долгий разрыв', 'eng uzun uzilish'],
    ['(limit', '(лимит', '(chegara'],
    ['EVA in pairs', 'EVA парами', 'EVA juft bo\'lib'],
    ['base mast in sight on the whole route', 'мачта базы видна на всём маршруте', 'baza ustuni butun yo\'lda ko\'rinadi'],
    ['about ', 'около ', 'taxminan '],
    ['mSv for this EVA at', 'мЗв за этот выход при', 'mZv bu EVA uchun,'],
    ['mSv per sol', 'мЗв за сол', 'mZv bir solda'],
    ['higher chance of dust storms', 'выше вероятность пылевых бурь', 'chang bo\'ronlari ehtimoli yuqori'],
    ['cached', 'из кэша', 'keshdan'],
    ['Start EVA · helmet view', 'Начать EVA · вид из шлема', 'EVA ni boshlash · dubulg\'a ko\'rinishi'],
    ['Simulate solar storm', 'Смоделировать солнечную бурю', 'Quyosh bo\'ronini modellashtirish'],
    ['Stop storm simulation', 'Остановить бурю', 'Bo\'ronni to\'xtatish'],
    ['Share link', 'Поделиться', 'Ulashish'],
    ['Print card', 'Печать карточки', 'Kartani chop etish'],
    ['Save offline', 'Сохранить офлайн', 'Oflayn saqlash'],
    ['Saved offline ✓', 'Сохранено офлайн ✓', 'Oflayn saqlandi ✓'],
    ['Saving', 'Сохранение', 'Saqlanmoqda'],
    ['map files saved. The planner now works without internet.', 'файлов карт сохранено. Планировщик теперь работает без интернета.', 'xarita fayli saqlandi. Rejalashtiruvchi endi internetsiz ishlaydi.'],
    ['Clear plan', 'Очистить план', 'Rejani tozalash'],
    ['Place the base first.', 'Сначала поставьте базу.', 'Avval bazani qo\'ying.'],
    ['Link copied. Anyone who opens it sees this plan.', 'Ссылка скопирована. Кто её откроет, увидит этот план.', 'Havola nusxalandi. Uni ochgan kishi shu rejani ko\'radi.'],
    ['Copy this link:', 'Скопируйте ссылку:', 'Havolani nusxalang:'],

    // ---- welcome ----
    ['S.E.R.A Mission Planner', 'Планировщик миссии S.E.R.A', 'S.E.R.A missiya rejalashtiruvchisi'],
    ['Plan a walk on Mars on the real terrain of Gale Crater. S.E.R.A checks the plan, says', 'Спланируйте прогулку по Марсу на настоящем рельефе кратера Гейл. S.E.R.A проверит план и скажет', 'Geyl kraterining haqiqiy relyefida Marsda sayr rejalashtiring. S.E.R.A rejani tekshiradi va aytadi:'],
    ['or', 'или', 'yoki'],
    ['with the reason, and always knows the way home.', 'с причиной — и всегда знает путь домой.', 'sababi bilan, va uyga yo\'lni doim biladi.'],
    ['Show demo plan', 'Показать демо-план', 'Demo rejani ko\'rsatish'],
    ['Plan my own EVA', 'Спланировать свой выход', 'O\'z EVA rejamni tuzish'],
    ['1-minute tour', 'Тур на 1 минуту', '1 daqiqalik tur'],
    ['1-minute tour ▶', 'Тур на 1 минуту ▶', '1 daqiqalik tur ▶'],

    // ---- helmet view ----
    ['Helmet view, simulation', 'Вид из шлема, симуляция', 'Dubulg\'a ko\'rinishi, simulyatsiya'],
    ['Simulation', 'Симуляция', 'Simulyatsiya'],
    ['Pre-EVA verdict', 'Вердикт до выхода', 'Chiqishdan oldingi xulosa'],
    ['Exit ✕', 'Выход ✕', 'Chiqish ✕'],
    ['Suit time left', 'Осталось времени скафандра', 'Skafandr vaqti qoldi'],
    ['Home from here', 'Домой отсюда', 'Bu yerdan uyga'],
    ['Spare if turning back now', 'Запас, если повернуть сейчас', 'Hozir qaytilsa, zaxira'],
    ['Next', 'Дальше', 'Keyingi'],
    ['Slope under feet', 'Уклон под ногами', 'Oyoq ostidagi qiyalik'],
    ['Elevation', 'Высота', 'Balandlik'],
    ['Play', 'Пуск', 'Boshlash'],
    ['Replay', 'Повтор', 'Qayta'],
    ['Pause', 'Пауза', 'Pauza'],
    ['Plan', 'План', 'Reja'],
    ['Emergency · home', 'Авария · домой', 'Favqulodda · uyga'],
    ['Simulation speed', 'Скорость симуляции', 'Simulyatsiya tezligi'],
    ['EVA timeline', 'Ход выхода', 'EVA vaqt chizig\'i'],
    ['On plan', 'По плану', 'Reja bo\'yicha'],
    ['Turn back now: the way home needs the suit reserve', 'Поворачивайте сейчас: на путь домой нужен резерв скафандра', 'Hozir qayting: uyga yo\'l uchun skafandr zaxirasi kerak'],
    ['Less than 30 min of spare suit time', 'Запас скафандра меньше 30 мин', 'Skafandr zaxirasi 30 daqiqadan kam'],
    ['Emergency return: fastest safe way home', 'Аварийный возврат: самый быстрый безопасный путь домой', 'Favqulodda qaytish: uyga eng tez xavfsiz yo\'l'],
    ['Back at base after emergency return', 'На базе после аварийного возврата', 'Favqulodda qaytishdan so\'ng bazada'],
    ['EVA complete, back at base', 'Выход окончен, на базе', 'EVA tugadi, bazada'],
    ['Emergency return to base', 'Аварийный возврат на базу', 'Bazaga favqulodda qaytish'],
    ['Emergency return', 'Аварийный возврат', 'Favqulodda qaytish'],
    ['At base', 'На базе', 'Bazada'],
    ['Back to base', 'Обратно на базу', 'Bazaga qaytish'],
    ['Science work', 'Научная работа', 'Ilmiy ish'],
    ['Base link', 'Связь с базой', 'Baza bilan aloqa'],
    ['No link · buddy relay', 'Нет связи · через напарника', 'Aloqa yo\'q · sherik orqali'],
    [' left', ' осталось', ' qoldi'],

    // ---- Curiosity, CRISM popups ----
    ['Add as science point', 'Добавить как научную точку', 'Ilmiy nuqta sifatida qo\'shish'],
    ['local mean time, looking', 'местное среднее время, направление', 'mahalliy o\'rtacha vaqt, yo\'nalish'],
    ['elevation', 'высота', 'balandlik'],
    ['Polyhydrated sulfate', 'Полигидратированный сульфат', 'Poligidratlangan sulfat'],
    ['Monohydrated sulfate (kieserite-like)', 'Моногидратированный сульфат (типа кизерита)', 'Monogidratlangan sulfat (kizeritga o\'xshash)'],
    ['Fe/Mg clay (smectite)', 'Fe/Mg-глина (смектит)', 'Fe/Mg gil (smektit)'],
    ['Al clay or hydrated silica', 'Al-глина или гидратированный кремнезём', 'Al gil yoki gidratlangan kremnezyom'],
    ['signal', 'сигнал', 'signal'],
    ['strong', 'сильный', 'kuchli'],
    ['moderate', 'средний', 'o\'rtacha'],
    ['weak', 'слабый', 'kuchsiz'],
    ['zone typical', 'обычный в зоне', 'hududda odatiy'],
    ['Safe ground', 'Безопасный грунт в', 'Xavfsiz grunt'],
    ['from the strongest signal (slope under 15°).', 'от самого сильного сигнала (уклон меньше 15°).', 'eng kuchli signaldan (qiyalik 15° dan past).'],
    ['Relative signal from CRISM browse images, not abundance. Check it on the ground.', 'Относительный сигнал по обзорным картам CRISM, а не содержание. Проверьте на месте.', 'CRISM ko\'rib chiqish rasmlaridan nisbiy signal, miqdor emas. Joyida tekshiring.'],

    // ---- tour ----
    ['Mars, real NASA maps', 'Марс, настоящие карты NASA', 'Mars, NASAning haqiqiy xaritalari'],
    ['A 3D Mars from Viking colour and MOLA relief. Gale Crater is where Curiosity works today.', '3D-Марс по цвету Viking и рельефу MOLA. В кратере Гейл сегодня работает Curiosity.', 'Viking rangi va MOLA relyefidan 3D Mars. Curiosity bugun Geyl kraterida ishlamoqda.'],
    ['One EVA zone, 2 × 2 km', 'Одна зона EVA, 2 × 2 км', 'Bitta EVA hududi, 2 × 2 km'],
    ['Real terrain from a 1 m elevation model (HiRISE, CTX, HRSC). Yellow: steep, slower. Red: over 25°, closed.', 'Настоящий рельеф по модели высот 1 м (HiRISE, CTX, HRSC). Жёлтый — круто, медленнее. Красный — больше 25°, закрыто.', '1 m balandlik modelidan haqiqiy relyef (HiRISE, CTX, HRSC). Sariq — tik, sekinroq. Qizil — 25° dan ortiq, yopiq.'],
    ['Plan in one click', 'План в один клик', 'Bir bosishda reja'],
    ['Base and three science points. S.E.R.A finds a safe path over the slopes and the fastest order of the points.', 'База и три научные точки. S.E.R.A находит безопасный путь по склонам и самый быстрый порядок точек.', 'Baza va uchta ilmiy nuqta. S.E.R.A qiyaliklar bo\'ylab xavfsiz yo\'l va nuqtalarning eng tez tartibini topadi.'],
    ['One clear answer with the reason: suit time, daylight, slopes, radio, dose and live space weather.', 'Один ясный ответ с причиной: время скафандра, светлое время, уклоны, радио, доза и живая космическая погода.', 'Sababi bilan bitta aniq javob: skafandr vaqti, yorug\' vaqt, qiyaliklar, radio, doza va jonli kosmik ob-havo.'],
    ['Always the way home', 'Всегда путь домой', 'Doim uyga yo\'l'],
    ['Mint dashed line: the fastest safe way back from every point. Downhill is faster than uphill.', 'Мятный пунктир — самый быстрый безопасный путь назад с каждой точки. Вниз быстрее, чем вверх.', 'Yalpiz punktir — har bir nuqtadan eng tez xavfsiz qaytish yo\'li. Pastga tushish yuqoriga chiqishdan tezroq.'],
    ['Science on the way', 'Наука по пути', 'Yo\'l-yo\'lakay ilm'],
    ['MRO CRISM mineral signals: sulfates and clays. Any spot can be added as a named science point.', 'Сигналы минералов MRO CRISM: сульфаты и глины. Любое место можно добавить как научную точку с названием.', 'MRO CRISM mineral signallari: sulfatlar va gillar. Har qanday joyni nomli ilmiy nuqta sifatida qo\'shish mumkin.'],
    ['Solar storm', 'Солнечная буря', 'Quyosh bo\'roni'],
    ['A proton event turns the plan to NO-GO at once. Live data from NASA DONKI and NOAA.', 'Протонное событие сразу делает план NO-GO. Живые данные NASA DONKI и NOAA.', 'Proton hodisasi rejani darhol NO-GO qiladi. NASA DONKI va NOAA jonli ma\'lumotlari.'],
    ['Helmet view', 'Вид из шлема', 'Dubulg\'a ko\'rinishi'],
    ['The walk as the visor shows it: suit time left, way home from here, next target. One button: Emergency · home.', 'Прогулка глазами визора: остаток времени скафандра, путь домой отсюда, следующая цель. Одна кнопка: «Авария · домой».', 'Visor ko\'rsatgan sayr: skafandr vaqti qoldig\'i, bu yerdan uyga yo\'l, keyingi maqsad. Bitta tugma: «Favqulodda · uyga».'],
    ['Checked with real data', 'Проверено настоящими данными', 'Haqiqiy ma\'lumotlar bilan tekshirilgan'],
    ['Our terrain matches Curiosity\'s own records within 0.26 m on average over 144 stops. Your turn: plan your own EVA.', 'Наш рельеф совпадает с записями самого Curiosity в среднем до 0,26 м на 144 остановках. Ваша очередь: спланируйте свой выход.', 'Bizning relyef Curiosityning o\'z yozuvlari bilan 144 to\'xtashda o\'rtacha 0,26 m aniqlikda mos keladi. Endi siz: o\'z EVA rejangizni tuzing.'],
    ['Next →', 'Дальше →', 'Keyingi →'],
    ['Finish', 'Готово', 'Tugatish'],
    ['End tour', 'Закончить тур', 'Turni tugatish'],
    ['Continue', 'Продолжить', 'Davom etish'],

    // ---- globe ----
    ['Olympus Mons', 'гора Олимп', 'Olimp tog\'i'],
    ['Valles Marineris', 'долины Маринер', 'Mariner vodiylari'],
    ['Jezero Crater', 'кратер Езеро', 'Yezero krateri'],
    ['Hellas Planitia', 'равнина Эллада', 'Ellada tekisligi'],
    ['North polar cap', 'Северная полярная шапка', 'Shimoliy qutb qalpog\'i'],
    ['Curiosity has worked here since 2012. Our EVA zone is on the slopes of Mount Sharp.', 'Curiosity работает здесь с 2012 года. Наша зона EVA — на склонах горы Шарп.', 'Curiosity bu yerda 2012 yildan beri ishlaydi. Bizning EVA hududimiz Sharp tog\'i yonbag\'rida.'],
    ['The tallest volcano in the Solar System, about 22 km high and 600 km wide.', 'Самый высокий вулкан Солнечной системы: высота около 22 км, ширина 600 км.', 'Quyosh tizimidagi eng baland vulqon: balandligi taxminan 22 km, kengligi 600 km.'],
    ['A canyon system about 4,000 km long and up to 7 km deep.', 'Система каньонов длиной около 4000 км и глубиной до 7 км.', 'Uzunligi taxminan 4000 km, chuqurligi 7 km gacha bo\'lgan kanyonlar tizimi.'],
    ['An old lake with a river delta. Perseverance has explored it since 2021.', 'Древнее озеро с дельтой реки. Perseverance исследует его с 2021 года.', 'Daryo deltasi bo\'lgan qadimgi ko\'l. Perseverance uni 2021 yildan beri o\'rganmoqda.'],
    ['A giant impact basin, about 2,300 km across: the lowest plain on Mars.', 'Огромный ударный бассейн около 2300 км в поперечнике — самая низкая равнина Марса.', 'Diametri taxminan 2300 km bo\'lgan ulkan zarba havzasi — Marsdagi eng past tekislik.'],
    ['Layers of water ice and dust, about 1,000 km across.', 'Слои водяного льда и пыли, около 1000 км в поперечнике.', 'Suv muzi va chang qatlamlari, diametri taxminan 1000 km.'],
    ['Start demo mission →', 'Начать демо-миссию →', 'Demo missiyani boshlash →'],
    ['Plan my own EVA →', 'Спланировать свой выход →', 'O\'z EVA rejamni tuzish →'],
    ['Open on the map →', 'Открыть на карте →', 'Xaritada ochish →'],
    ['Open EVA zone in S.E.R.A →', 'Открыть зону EVA в S.E.R.A →', 'S.E.R.A da EVA hududini ochish →'],
    ['Drag to turn · click a place', 'Тяните, чтобы вращать · нажмите на место', 'Aylantirish uchun torting · joyni bosing'],

    // ---- print card ----
    ['S.E.R.A · EVA card', 'S.E.R.A · карточка EVA', 'S.E.R.A · EVA kartasi'],
    ['Simulation planner for a Mars EVA, Gale Crater. MODEL values are estimates. Team VAA · NASA Space Apps 2026.', 'Симулятор планирования выхода на Марсе, кратер Гейл. Значения MODEL — оценки. Команда VAA · NASA Space Apps 2026.', 'Marsda chiqishni rejalashtirish simulyatori, Geyl krateri. MODEL qiymatlari — taxminlar. VAA jamoasi · NASA Space Apps 2026.'],
    ['local solar time', 'местного солнечного времени', 'mahalliy quyosh vaqti'],
    ['EVA start', 'старт EVA', 'EVA boshlanishi'],
    ['Curiosity sol', 'сол Curiosity', 'Curiosity soli'],

    // ---- project site ----
    ['Overview', 'Обзор', 'Umumiy'],
    ['Science & Data', 'Наука и данные', 'Ilm va ma\'lumotlar'],
    ['About Project', 'О проекте', 'Loyiha haqida'],
    ['Launch Mission ↗', 'Начать миссию ↗', 'Missiyani boshlash ↗'],
    ['Launch Mission', 'Начать миссию', 'Missiyani boshlash'],
    ['Safer exploration', 'Безопасное исследование', 'Xavfsizroq tadqiqot'],
    ['A safer way', 'Безопасный путь', 'Mars bo\'ylab'],
    ['across', 'по', 'xavfsizroq'],
    ['Mars.', 'Марсу.', 'yo\'l.'],
    ['· Sol ', '· сол ', '· sol '],
    ['— Viking, CTX and HiRISE mosaics', '— мозаики Viking, CTX и HiRISE', '— Viking, CTX va HiRISE mozaikalari'],
    ['NASA/JPL MMGIS waypoints and traverse: 144 Curiosity stops in our zone', 'точки и линия пути NASA/JPL MMGIS: 144 остановки Curiosity в нашей зоне', 'NASA/JPL MMGIS nuqtalari va yo\'li: hududimizda Curiosityning 144 to\'xtashi'],
    [', Navcam, linked', ', Navcam, по ссылке', ', Navcam, havola orqali'],
    [', live', ', вживую', ', jonli'],
    ['Meet', 'Знакомьтесь:', 'Tanishing:'],
    ['— Safe Exploration & Return Assistant. Plan a walk across Gale Crater on real terrain, see every risk with a clear verdict, and always keep the way back in sight.', '— помощник безопасного исследования и возвращения. Спланируйте прогулку по кратеру Гейл на настоящем рельефе, увидьте каждый риск в ясном вердикте и всегда держите путь назад в поле зрения.', '— xavfsiz tadqiqot va qaytish yordamchisi. Geyl krateri bo\'ylab haqiqiy relyefda sayr rejalashtiring, har bir xavfni aniq xulosada ko\'ring va qaytish yo\'lini doim ko\'z oldingizda tuting.'],
    ['Exploration zone', 'Зона исследования', 'Tadqiqot hududi'],
    ['Terrain', 'Рельеф', 'Relyef'],
    ['Real 1 m DEM', 'Настоящий DEM 1 м', 'Haqiqiy DEM 1 m'],
    ['Focus', 'Главное', 'Asosiy'],
    ['Safe return', 'Безопасное возвращение', 'Xavfsiz qaytish'],
    ['Explore Mars', 'Исследуйте Марс', 'Marsni o\'rganing'],
    ['Turn the planet. Pick a place.', 'Поверните планету. Выберите место.', 'Sayyorani aylantiring. Joyni tanlang.'],
    ['A real 3D Mars from NASA data: Viking colour with MOLA and HRSC relief. Gale Crater opens our EVA zone in the planner.', 'Настоящий 3D-Марс по данным NASA: цвет Viking с рельефом MOLA и HRSC. Кратер Гейл открывает нашу зону EVA в планировщике.', 'NASA ma\'lumotlaridan haqiqiy 3D Mars: Viking rangi, MOLA va HRSC relyefi. Geyl krateri rejalashtiruvchida EVA hududimizni ochadi.'],
    ['Mission / demo EVA', 'Миссия / демо-EVA', 'Missiya / demo EVA'],
    ['Base → 3 science points → Base', 'База → 3 научные точки → База', 'Baza → 3 ilmiy nuqta → Baza'],
    ['Distance', 'Расстояние', 'Masofa'],
    ['Home from farthest', 'Домой с дальней точки', 'Eng uzoq nuqtadan uyga'],
    ['Open demo EVA →', 'Открыть демо-EVA →', 'Demo EVA ni ochish →'],
    ['01 — Why S.E.R.A', '01 — Почему S.E.R.A', '01 — Nega S.E.R.A'],
    ['Made for decisions,', 'Сделано для решений,', 'Qarorlar uchun yaratilgan,'],
    ['not just destinations.', 'а не только для маршрутов.', 'faqat manzillar uchun emas.'],
    ['Every number on this page is computed live from the real terrain, by the same code as the planner.', 'Каждое число на этой странице считается вживую по настоящему рельефу тем же кодом, что и планировщик.', 'Bu sahifadagi har bir raqam rejalashtiruvchi bilan bir xil kod orqali haqiqiy relyefdan jonli hisoblanadi.'],
    ['Route Intelligence', 'Умный маршрут', 'Aqlli yo\'nalish'],
    ['A safe path over the real slopes, and the fastest order of your science points, found in a fraction of a second.', 'Безопасный путь по настоящим склонам и самый быстрый порядок научных точек — за доли секунды.', 'Haqiqiy qiyaliklar bo\'ylab xavfsiz yo\'l va ilmiy nuqtalarning eng tez tartibi — soniyaning bir ulushida.'],
    ['Terrain & Risk', 'Рельеф и риск', 'Relyef va xavf'],
    ['Slopes, suit time, daylight and space weather in one verdict —', 'Уклоны, время скафандра, светлое время и космическая погода в одном вердикте —', 'Qiyaliklar, skafandr vaqti, yorug\' vaqt va kosmik ob-havo bitta xulosada —'],
    ['— always with the reason.', '— всегда с причиной.', '— doim sababi bilan.'],
    ['Always Return', 'Всегда вернуться', 'Doim qaytish'],
    ['The fastest way home from every point of the zone. Walking uphill takes longer than downhill, and S.E.R.A knows it.', 'Самый быстрый путь домой из любой точки зоны. Вверх идти дольше, чем вниз, и S.E.R.A это знает.', 'Hududning har bir nuqtasidan uyga eng tez yo\'l. Yuqoriga yurish pastga tushishdan uzoqroq, S.E.R.A buni biladi.'],
    ['02 — How it works', '02 — Как это работает', '02 — Qanday ishlaydi'],
    ['Three steps from plan to home.', 'Три шага от плана до дома.', 'Rejadan uygacha uch qadam.'],
    ['Four steps from plan to home.', 'Четыре шага от плана до дома.', 'Four steps from plan to home.'],
    ['Watch for deviations', 'Следить за отклонениями', 'Watch for deviations'],
    ['During the walk S.E.R.A follows the plan. Off the route, it builds a new safe path to the next point. Mission Twin compares a fast and a gentle way.', 'Во время выхода S.E.R.A следит за планом. Сошли с маршрута — она строит новый безопасный путь к следующей точке. Mission Twin сравнивает быстрый и пологий путь.', 'During the walk S.E.R.A follows the plan. Off the route, it builds a new safe path to the next point. Mission Twin compares a fast and a gentle way.'],
    ['Return to safety', 'Вернуть в безопасность', 'Return to safety'],
    ['On a NO-GO (storm, suit time, sunset) S.E.R.A rebuilds the fastest way home from where you stand. The way home is visible at every point.', 'При NO-GO (буря, время скафандра, закат) S.E.R.A перестраивает самый быстрый путь домой от того места, где вы стоите. Путь домой виден в каждой точке.', 'On a NO-GO (storm, suit time, sunset) S.E.R.A rebuilds the fastest way home from where you stand. The way home is visible at every point.'],
    ['Plan at the base', 'План на базе', 'Bazada reja'],
    ['Place the habitat and the science points on the map of a 2 × 2 km zone at Mount Sharp.', 'Поставьте жилой модуль и научные точки на карте зоны 2 × 2 км у горы Шарп.', 'Yashash moduli va ilmiy nuqtalarni Sharp tog\'i yonidagi 2 × 2 km hudud xaritasiga qo\'ying.'],
    ['Check before going out', 'Проверка перед выходом', 'Chiqishdan oldin tekshiruv'],
    ['S.E.R.A builds the route, keeps a 15 % suit reserve, checks sunset and live space weather, and gives the verdict.', 'S.E.R.A строит маршрут, держит 15 % резерва скафандра, проверяет закат и живую космическую погоду и выносит вердикт.', 'S.E.R.A yo\'nalish tuzadi, skafandrning 15 % zaxirasini saqlaydi, quyosh botishi va jonli kosmik ob-havoni tekshiradi va xulosa beradi.'],
    ['Come back safely', 'Вернитесь безопасно', 'Xavfsiz qayting'],
    ['The way home and its time stay visible for every point of the walk.', 'Путь домой и его время видны в каждой точке прогулки.', 'Uyga yo\'l va uning vaqti sayrning har bir nuqtasida ko\'rinadi.'],
    ['03 — Science & Data', '03 — Наука и данные', '03 — Ilm va ma\'lumotlar'],
    ['Built on mission data,', 'Построено на данных миссий,', 'Missiya ma\'lumotlariga asoslangan,'],
    ['not on guesses.', 'а не на догадках.', 'taxminlarga emas.'],
    ['Values in the planner are marked', 'Значения в планировщике помечены', 'Rejalashtiruvchidagi qiymatlar belgilangan:'],
    ['when a mission measured them and', ', если их измерила миссия, и', ', agar ularni missiya o\'lchagan bo\'lsa, va'],
    ['when they are our estimate.', ', если это наша оценка.', ', agar bu bizning taxminimiz bo\'lsa.'],
    ['Data', 'Данные', 'Ma\'lumot'],
    ['Source', 'Источник', 'Manba'],
    ['Mission', 'Миссия', 'Missiya'],
    ['Map imagery', 'Снимки для карты', 'Xarita tasvirlari'],
    ['Terrain, 1 m', 'Рельеф, 1 м', 'Relyef, 1 m'],
    ['Rover path', 'Путь марсохода', 'Marsoxod yo\'li'],
    ['Rover photos', 'Фото марсохода', 'Marsoxod suratlari'],
    ['Weather', 'Погода', 'Ob-havo'],
    ['REMS daily reports', 'ежедневные отчёты REMS', 'REMS kundalik hisobotlari'],
    ['sols', 'солов', 'sol'],
    ['Solar particle events', 'Солнечные протонные события', 'Quyosh zarrachalari hodisalari'],
    ['X-ray flares', 'Рентгеновские вспышки', 'Rentgen chaqnashlari'],
    ['Mars time', 'Время Марса', 'Mars vaqti'],
    ['algorithm', 'алгоритм', 'algoritm'],
    ['04 — Checked with numbers', '04 — Проверено числами', '04 — Raqamlar bilan tekshirilgan'],
    ['We test the model', 'Мы проверяем модель', 'Biz modelni sinaymiz'],
    ['against real missions.', 'настоящими миссиями.', 'haqiqiy missiyalar bilan.'],
    ['mean height difference between our terrain and Curiosity\'s own record at its 144 stops in the zone', 'средняя разница высот между нашим рельефом и записями самого Curiosity на его 144 остановках в зоне', 'bizning relyef va Curiosityning hududdagi 144 to\'xtashidagi o\'z yozuvlari orasidagi o\'rtacha balandlik farqi'],
    ['mean difference between our Mars clock and 4,745 REMS weather reports', 'средняя разница между нашими часами Марса и 4745 отчётами погоды REMS', 'bizning Mars soatimiz va 4745 ta REMS ob-havo hisobotlari orasidagi o\'rtacha farq'],
    ['best order of 6 points equals trying all 720 orders: 320 min instead of 500 min in clicking order', 'лучший порядок 6 точек совпадает с перебором всех 720 вариантов: 320 мин вместо 500 мин в порядке кликов', '6 nuqtaning eng yaxshi tartibi barcha 720 variantni sinash bilan teng: bosish tartibidagi 500 daqiqa o\'rniga 320 daqiqa'],
    ['walking speed in a suit on flat ground; Apollo EVAs: about 2.2 km/h', 'скорость ходьбы в скафандре по ровному; на «Аполлонах» — около 2,2 км/ч', 'tekis joyda skafandrda yurish tezligi; Apollon EVA larida — taxminan 2,2 km/soat'],
    ['05 — About project', '05 — О проекте', '05 — Loyiha haqida'],
    ['Challenge 2026.', 'Challenge 2026.', 'Challenge 2026.'],
    ['S.E.R.A answers the challenge', 'S.E.R.A отвечает на челлендж', 'S.E.R.A quyidagi chellenjga javob beradi:'],
    [': a hyper-local, layered view of one EVA site, built from several NASA missions, to plan and carry out a walk on Mars and do science on the way.', ': сверхлокальный слоистый вид одного места выхода из данных нескольких миссий NASA, чтобы спланировать и провести прогулку по Марсу и заниматься наукой по пути.', ': bir nechta NASA missiyalari ma\'lumotlaridan bitta EVA joyining o\'ta mahalliy, qatlamli ko\'rinishi — Marsda sayrni rejalashtirish, o\'tkazish va yo\'l-yo\'lakay ilm bilan shug\'ullanish uchun.'],
    ['Made in Tashkent by', 'Сделано в Ташкенте командой', 'Toshkentda yaratildi:'],
    ['during the hackathon, 14–15 November 2026. The code was written with AI assistance (Claude by Anthropic) and reviewed by the team; the idea and every decision are the team\'s.', 'во время хакатона, 14–15 ноября 2026. Код написан с помощью ИИ (Claude от Anthropic) и проверен командой; идея и все решения — команды.', 'xakaton davomida, 2026 yil 14–15 noyabr. Kod sun\'iy intellekt (Anthropic kompaniyasining Claude) yordamida yozilgan va jamoa tomonidan tekshirilgan; g\'oya va barcha qarorlar jamoaniki.'],
    ['Try it now', 'Попробуйте сейчас', 'Hozir sinab ko\'ring'],
    ['The demo plan opens in one click.', 'Демо-план открывается в один клик.', 'Demo reja bir bosishda ochiladi.'],
    ['Not an official NASA product. Mars data: NASA, JPL-Caltech, USGS, ESA, NOAA.', 'Не официальный продукт NASA. Данные о Марсе: NASA, JPL-Caltech, USGS, ESA, NOAA.', 'NASAning rasmiy mahsuloti emas. Mars ma\'lumotlari: NASA, JPL-Caltech, USGS, ESA, NOAA.'],
    ['Safe Exploration & Return Assistant', 'Помощник безопасного исследования и возвращения', 'Xavfsiz tadqiqot va qaytish yordamchisi']
  ];

  // Numbers with units and patterns, after the phrases.
  var RULES = {
    ru: [[/^1 s = (\d+) min$/, '1 с = $1 мин'], [/^For (.+?) the fastest way is already the gentlest: both routes are the same\.$/, 'Для $1 самый быстрый путь уже самый пологий: маршруты совпадают.'], [/^Route B takes (.+?) longer but walks (\d+) m less on steep ground\. With a heavy suit and samples, I would take B\.$/, 'Маршрут B дольше на $1, зато на $2 м меньше крутых участков. С тяжёлым скафандром и образцами я бы выбрала B.'], [/^Off route by (\d+) m: new safe path to (.+)$/, 'Сход с маршрута на $1 м: новый безопасный путь к $2'], [/^New path to (.+)$/, 'Новый путь к $1'], [/^To (.+)$/, 'К: $1'], [/^Walk (.+)$/, 'Идти $1'], [/^Way home (.+)$/, 'Домой $1'], [/^Science work · (.+)$/, 'Научная работа · $1'], [/\bPoint (\d+)\b/g, 'Точка $1'],
      [/(\d+) h (\d+) min/g, '$1 ч $2 мин'], [/\b(\d+)h (\d+)m\b/g, '$1 ч $2 мин'], [/(\d+) h\b/g, '$1 ч'], [/(\d+) min\b/g, '$1 мин'], [/(\d) km\b/g, '$1 км'],
      [/(\d) m\b/g, '$1 м'], [/^Split into (\d+) EVAs/, 'Разбить на выходы: $1'], [/^EVA (\d+) · points (.+)$/, 'Выход $1 · точки $2'], [/Gale Crater · Sol (\d+)/, 'Кратер Гейл · сол $1'], [/^(\s*)ETA(\s*)$/, '$1Прибытие$2']],
    uz: [[/^To (.+)$/, 'Tomon: $1'], [/^Science work · (.+)$/, 'Ilmiy ish · $1'], [/\bPoint (\d+)\b/g, '$1-nuqta'],
      [/(\d+) h (\d+) min/g, '$1 soat $2 daq'], [/(\d+) h\b/g, '$1 soat'], [/(\d+) min\b/g, '$1 daq'],
      [/^Split into (\d+) EVAs/, '$1 ta chiqishga bo\'lish'], [/^EVA (\d+) · points (.+)$/, '$1-chiqish · nuqtalar $2'],
      [/Gale Crater · Sol (\d+)/, 'Geyl krateri · sol $1'], [/^(\s*)ETA(\s*)$/, '$1Yetib borish$2']]
  };

  // Whole sentences with numbers (S.E.R.A's advice): matched before the phrase list, so no phrase cuts them.
  var WHOLE = { ru: [[/^Curiosity REMS · mean of (\d+) sols at this season$/, 'Curiosity REMS · среднее за $1 солов в этот сезон'], [/^Too steep here \((\d+)°, limit (\d+)°\)\. Pick another spot\.$/, 'Здесь слишком круто ($1°, предел $2°). Выберите другое место.'], [/^Too steep there: (\d+)° \(the limit is 25°\)\.$/, 'Там слишком круто: $1° (предел 25°).'], [/^(\d+) science points, EVA (.+?), (.+?) of spare suit time\.$/, 'Научных точек: $1, выход $2, запас скафандра $3.'], [/^NO-GO · no safe way to (.+)$/, 'NO-GO · нет безопасного пути: $1'], [/^(\d+) m of the route is on 15–25° slopes \(yellow on the map\)\. Walking there takes twice as long\.$/, '$1 м маршрута идут по склонам 15–25° (жёлтые на карте). Там идти вдвое дольше.'], [/^The plan needs (.+?) more than the suit allows with the 15 % reserve\.$/, 'Плану нужно на $1 больше, чем позволяет скафандр с резервом 15 %.'], [/^Remove the farthest point \((.+?)\) or walk it as (\d+) EVAs\.$/, 'Уберите самую дальнюю точку ($1) или разбейте план на выходы: $2.'], [/^Remove the farthest point \((.+?)\) to keep more air for surprises\.$/, 'Уберите самую дальнюю точку ($1), чтобы остался воздух на неожиданности.'], [/^Remove the farthest point \((.+?)\)\.$/, 'Уберите самую дальнюю точку ($1).'], [/^Only (.+?) of spare suit time before the reserve\.$/, 'До резерва остаётся всего $1 запаса скафандра.'], [/^Start (\d\d:\d\d) is before sunrise \((\d\d:\d\d)\)\.$/, 'Старт в $1 — ещё до восхода ($2).'], [/^You would be back at (\S+), after sunset \((\S+)\)\.$/, 'Вы вернётесь в $1, уже после заката ($2).'], [/^Back at (\S+), less than 1 h before sunset \((\S+)\)\.$/, 'Возвращение в $1, меньше чем за 1 ч до заката ($2).'], [/^Solar particle event (\d+) h ago \(NASA DONKI\)\. Outside, the radiation dose is too high\.$/, 'Поток солнечных частиц $1 ч назад (NASA DONKI). Снаружи доза радиации слишком высокая.'], [/^X-class solar flare (\d+) h ago\.$/, 'Солнечная вспышка класса X $1 ч назад.'], [/^For (.+?) in a row the base mast is out of sight\.$/, '$1 подряд мачта базы вне прямой видимости.']], uz: [] };

  var lang = 'en';
  var phrases = { ru: [], uz: [] }, exact = { ru: {}, uz: {} };
  D.forEach(function (row) {
    [['ru', 1], ['uz', 2]].forEach(function (p) {
      if (!/^[A-Za-z]+$/.test(row[0])) phrases[p[0]].push([row[0], row[p[1]]]);
      exact[p[0]][row[0]] = row[p[1]];
    });
  });
  phrases.ru.sort(function (a, b) { return b[0].length - a[0].length; });
  phrases.uz.sort(function (a, b) { return b[0].length - a[0].length; });

  function translate(en, to) {
    if (to === 'en' || !en) return en;
    if (!/[A-Za-z]/.test(en)) return en;
    var trimmed = en.trim();
    if (exact[to][trimmed] !== undefined) return en.replace(trimmed, exact[to][trimmed]);
    var out = en.replace(/\s+/g, ' ');           // HTML source line breaks inside a sentence
    for (var k = 0; k < WHOLE[to].length; k++) {
      if (WHOLE[to][k][0].test(out)) {
        out = out.replace(WHOLE[to][k][0], WHOLE[to][k][1]);
        phrases[to].forEach(function (ph) { if (out.indexOf(ph[0]) !== -1) out = out.split(ph[0]).join(ph[1]); });
        RULES[to].forEach(function (r) { out = out.replace(r[0], r[1]); });
        return out;
      }
    }
    var list = phrases[to];
    for (var i = 0; i < list.length; i++) {
      if (out.indexOf(list[i][0]) !== -1) out = out.split(list[i][0]).join(list[i][1]);
    }
    RULES[to].forEach(function (r) { out = out.replace(r[0], r[1]); });
    return out;
  }

  // Text nodes and attributes keep their English original, so switching back is exact.
  var orig = new WeakMap(), shown = new WeakMap();
  var ATTRS = ['title', 'aria-label', 'placeholder'];
  var SKIP = 'script,style,.leaflet-control-attribution,.coords,.lang-toggle,.ph-link';

  function doText(node) {
    var p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    var cur = node.nodeValue;
    if (!shown.has(node) || shown.get(node) !== cur) orig.set(node, cur);   // the app wrote new text
    var out = translate(orig.get(node), lang);
    shown.set(node, out);
    if (out !== cur) node.nodeValue = out;
  }
  function doAttrs(el) {
    if (el.closest && el.closest(SKIP)) return;
    ATTRS.forEach(function (a) {
      if (!el.hasAttribute(a)) return;
      var key = 'data-en-' + a, cur = el.getAttribute(a);
      if (!el.hasAttribute(key) || el.getAttribute('data-tr-' + a) !== cur) el.setAttribute(key, cur);
      var out = translate(el.getAttribute(key), lang);
      el.setAttribute('data-tr-' + a, out);
      if (out !== cur) el.setAttribute(a, out);
    });
  }
  function walk(rootEl) {
    if (rootEl.nodeType === 3) { doText(rootEl); return; }
    if (rootEl.nodeType !== 1) return;
    doAttrs(rootEl);
    var w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }

  var busy = false;
  var mo = new MutationObserver(function (list) {
    if (busy) return;
    busy = true;
    list.forEach(function (m) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    });
    busy = false;
  });

  function setLang(l) {
    if (LANGS.indexOf(l) === -1) l = 'en';
    lang = l;
    document.documentElement.lang = l === 'uz' ? 'uz-Latn' : l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* private mode */ }
    busy = true; walk(document.body); busy = false;
    document.querySelectorAll('.lang-toggle').forEach(function (b) {
      b.textContent = l.toUpperCase();
      b.setAttribute('aria-label', 'Language: ' + { en: 'English', ru: 'Русский', uz: 'O\'zbekcha' }[l]);
    });
  }

  function init() {
    // A language button next to every theme button.
    document.querySelectorAll('[data-theme-toggle]').forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lang-toggle';
      b.title = 'EN / RU';
      b.addEventListener('click', function () { setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]); });
      t.parentNode.insertBefore(b, t);
    });
    var q = /[?&]lang=(en|ru|uz)\b/.exec(location.search);
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { saved = null; }
    setLang(q ? q[1] : (saved || 'en'));
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // t() keeps English: the observer translates what the app writes, and English stays the
  // original, so switching the language back always works.
  root.SeraI18n = { t: function (s) { return s; }, translate: function (s) { return translate(s, lang); },
    set: setLang, get lang() { return lang; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
