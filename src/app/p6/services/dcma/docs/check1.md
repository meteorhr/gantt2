DCMA Check 1 — Параметры и результат
Общее

Назначение: оценка логики сетевого графика: доля «eligible» задач без предшественников/преемников.
Источник данных: TASK, TASKPRED, валидация по PROJECT.

Входные параметры (DcmaCheck1Options)
1) Базовые (совместимы со старой версией)
Параметр	Тип	По умолчанию	Что делает	Влияние
excludeTypes	string[] | Set<string>	['TT_WBS'] (если не разрешён WBS фильтром)	Исключает типы задач из знаменателя	Уменьшает totalEligible; счётчик в details.exclusions.excludedByType
milestoneTypes	string[] | Set<string>	['TT_Mile','TT_StartMile','TT_FinMile']	Определяет, что считать «вехой»	Влияет на isMilestone, причины ExceptionByRule, поведение исключений
includeLists	boolean	true	Возвращать подробные списки в details	Увеличивает объём ответа/памяти, не влияет на метрики
excludeCompleted	boolean	false	Исключать завершённые	Уменьшает знаменатель; счётчик excludedCompleted
excludeLoEAndHammock	boolean	true	Исключать LOE/Hammock/Summary	Уменьшает знаменатель; счётчик excludedLoEOrHammock
treatMilestonesAsExceptions	boolean	true	Не считать нарушением отсутствие входящей у старт-вехи и исходящей у финиш-вехи	Снижает missing*, uniqueMissingAny, процент
statusMap	Record<string,'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'UNKNOWN'>	см. ниже	Нормализация статусов P6	Корректная работа excludeCompleted, status_norm
ignoreLoEAndHammockLinksInLogic	boolean	false	Игнорировать связи, если другая сторона — только LOE/Hammock/Summary	Повышает чувствительность, увеличивает нарушения
includeDQ	boolean	true	Возврат метрик качества сетки	Не влияет на процент/знаменатель

statusMap (дефолт):

{
  'NOT STARTED': 'NOT_STARTED',
  'IN PROGRESS': 'IN_PROGRESS',
  'COMPLETED': 'COMPLETED',
  'TK_COMPLETE': 'COMPLETED',
  'FINISHED': 'COMPLETED',
  'INACTIVE': 'UNKNOWN',
  'TK_INACTIVE': 'UNKNOWN',
  'OBSOLETE': 'UNKNOWN',
  'CANCELLED': 'UNKNOWN',
}

2) Activity Filters (activityFilters)

Набор удобных тумблеров, влияющих на состав знаменателя. Они дополняют базовые опции и формируют «эффективные» исключения.

Параметр	Тип	По умолчанию	Что включает в знаменатель	Если false (исключает)
taskResourceDependent	boolean	true	TT_TASK, TT_RSRC (и их синонимы)	excludedTaskResource
milestones	boolean	true	milestoneTypes	excludedMilestones
levelOfEffort	boolean	false	LOE/Hammock/Summary	Удерживает дефолтное исключение (вместе с excludeLoEAndHammock)
wbsSummary	boolean	false	TT_WBS	Если false, тип остаётся в excludeTypes
completed	boolean	true	Завершённые	Если false, действует как excludeCompleted=true
obsolete	boolean	true	Inactive/Obsolete/Cancelled	Если false, excludedObsolete

Дополнительно:

statusObsoleteKeys: string[] — какие статус-строки считать «obsolete/inactive/cancelled».
Дефолт: ['INACTIVE','TK_INACTIVE','OBSOLETE','CANCELLED'].

3) Threshold levels (thresholds)

Оценка «качества» по порогам, задаваемым пользователем.

Параметр	Тип	По умолчанию	Назначение	Правила
greatPct	number	5	Порог «Great»	Кламп 0–100; при конфликте с Average берётся min(great, average)
averagePct	number	25	Порог «Average»	Кламп 0–100; итоговое average ≥ great

Алгоритм оценки:

percentMissingAny <= thresholdGreatPct   → 'Great'
иначе ≤ thresholdAveragePct              → 'Average'
иначе                                   → 'Poor'


Важно: исторический DCMA-порог 5% по-прежнему возвращается как:

threshold5PercentValue = ceil(totalEligible * 0.05)

threshold5PercentExceeded = percentMissingAny > 5

Результат (DcmaCheck1Result)
Поле	Тип	Описание
proj_id	number	Идентификатор проекта
totalEligibleRaw	number	Кол-во задач после первичного отсечения WBS (до прочих исключений)
totalEligible	number	Итоговый знаменатель (после всех исключений)
missingPredecessor	number	Задачи без предшественников (с учётом исключений для вех)
missingSuccessor	number	Задачи без преемников (аналогично)
missingBoth	number	Без обеих сторон
uniqueMissingAny	number	Уникальные задачи с отсутствием хотя бы одной стороны
percentMissingAny	number	uniqueMissingAny / totalEligible * 100 (округление round2)
threshold5PercentValue	number	Абсолютное значение 5%
threshold5PercentExceeded	boolean	Превышение исторического порога (строго > 5)
thresholdGreatPct	number	Применённый пользовательский Great, %
thresholdAveragePct	number	Применённый пользовательский Average, %
performance	'Great' | 'Average' | 'Poor'	Итоговая оценка по кастомным порогам
appliedActivityFilters	DcmaActivityFilters	Фактически применённые фильтры активности
details.items	DcmaCheck1Item[]	Детализация по «eligible» задачам
details.missingPredList	DcmaCheck1Item[]	Нарушения по предшественникам
details.missingSuccList	DcmaCheck1Item[]	Нарушения по преемникам
details.missingBothList	DcmaCheck1Item[]	Нарушения по обеим сторонам
details.exclusions.excludedWbs	number	Сколько исключено WBS
details.exclusions.excludedCompleted	number	Сколько исключено завершённых
details.exclusions.excludedLoEOrHammock	number	Сколько исключено LOE/Hammock/Summary
details.exclusions.excludedByType	Record<string,number>	Исключения по типам
details.exclusions.excludedObsolete	number	Исключено как obsolete/inactive
details.exclusions.excludedTaskResource	number	Исключено Task/Resource dependent (если фильтр выключен)
details.exclusions.excludedMilestones	number	Исключено Milestones (если фильтр выключен)
details.dq.duplicateLinks	number	Дубликаты связей (succ
details.dq.selfLoops	number	Самозацикливания
details.dq.orphanLinks	number	«Сиротские» связи на отсутствующие задачи
Логика ключевых исключений

Milestones как исключение нарушений (treatMilestonesAsExceptions=true):

Старт-веха без входящих → не нарушение (StartMilestone).

Финиш-веха без исходящих → не нарушение (FinishMilestone).

Любая веха без одной стороны может считаться ExceptionByRule.

Игнорирование «фиктивных» связей (ignoreLoEAndHammockLinksInLogic=true):
Если все связи задачи идут только на LOE/Hammock/Summary, связь считается отсутствующей.

Рекомендации по настройке

Строгая проверка логики:
activityFilters = { completed: true, levelOfEffort: false, wbsSummary: false, milestones: true, taskResourceDependent: true, obsolete: false },
плюс ignoreLoEAndHammockLinksInLogic = true, treatMilestonesAsExceptions = true.

Гибкие пороги качества:
Подберите thresholds.greatPct и thresholds.averagePct под корпоративные стандарты (например, 3% и 15%).
Порог 5% для DCMA сохраняйте для отчётной сопоставимости (threshold5Percent*).

Примеры вызова
Пример 1 — дефтолтные фильтры + пользовательские пороги
const res = await dcmaCheck1.analyzeCheck1(42, {
  thresholds: { greatPct: 3, averagePct: 15 },
});

Пример 2 — строгий знаменатель и игнор LOE-связей
const res = await dcmaCheck1.analyzeCheck1(42, {
  activityFilters: {
    completed: true,
    levelOfEffort: false,
    wbsSummary: false,
    milestones: true,
    taskResourceDependent: true,
    obsolete: false,
  },
  ignoreLoEAndHammockLinksInLogic: true,
  thresholds: { greatPct: 5, averagePct: 25 },
});

UX-подсказки

Отдельная панель Activity Filters (шесть тумблеров).

Пара числовых полей Great % и Average % (валидация 0–100; автоисправление average ≥ great).

В отчёте: показывать performance, percentMissingAny, пороги и details.exclusions для прозрачности.

Ниже — полный перечень тумблеров (on/off), которые вы можете использовать в Check 1. Я сгруппировал их по смыслу.

1) Activity Filters (формируют знаменатель)

taskResourceDependent — включать Task/Resource-dependent задачи (TT_TASK, TT_RSRC, и т. п.).

milestones — включать вехи (TT_Mile, TT_StartMile, TT_FinMile).

levelOfEffort — включать LOE/Hammock/Summary (TT_LOE, TT_Hammock, TT_Summary).

wbsSummary — включать WBS-summary (TT_WBS).

completed — включать завершённые задачи (если off — исключаются из знаменателя).

obsolete — включать «неактивные/устаревшие/отменённые» (если off — исключаются).

Примечание: obsolete опирается на список статусов (statusObsoleteKeys: INACTIVE, TK_INACTIVE, OBSOLETE, CANCELLED и т. д.).

2) Логика оценки (как считать нарушение)

treatMilestonesAsExceptions — не считать нарушением отсутствие входящей у старт-вехи и исходящей у финиш-вехи.

ignoreLoEAndHammockLinksInLogic — игнорировать связи, если «другая сторона» — только LOE/Hammock/Summary (то есть такие связи не засчитываются как реальные).

3) Диагностика и детализация (что возвращать)

includeDQ — добавлять метрики качества сетки (duplicate/self-loop/orphan).

includeLists — возвращать подробные списки (items, missingPredList, missingSuccList, missingBothList, exclusions).

Быстрый пример конфигурации тумблеров
const options = {
  activityFilters: {
    taskResourceDependent: true,
    milestones: true,
    levelOfEffort: false,
    wbsSummary: false,
    completed: true,
    obsolete: true,
  },
  treatMilestonesAsExceptions: true,
  ignoreLoEAndHammockLinksInLogic: true,
  includeDQ: true,
  includeLists: true,
};