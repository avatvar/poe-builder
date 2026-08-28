"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type Theme = "light" | "dark";
type ClassId = "marauder" | "ranger" | "witch" | "duelist" | "templar" | "shadow" | "scion";
type StyleId = "melee" | "ranged" | "spells" | "minions" | "totems" | "traps" | "poison" | "bleed" | "elemental" | "hybrid";

type ClassOption = {
  id: ClassId;
  name: string;
  short: string;
  fantasy: string;
  stats: string;
  styles: StyleId[];
  ascendancies: Partial<Record<StyleId, string>>;
  passiveFocus: string;
};

type StyleOption = {
  id: StyleId;
  name: string;
  description: string;
  difficulty: "Легко" | "Средне";
  color: string;
  stages: Array<{ levels: string; title: string; skills: string; focus: string }>;
};

type StageDetail = { gameplay: string; mechanics: string };
type PassiveGuide = {
  keystone: string;
  rule: string;
  milestones: Array<{ points: string; title: string; nodes: string[]; purpose: string }>;
};
type GemGuide = {
  mainByStage: string[];
  supports: string[];
  alternative: string;
  warnings: Array<{ gem: string; rule: string }>;
};
type BossGuide = { steps: string[]; mistake: string };
type Aura = { name: string; reservation: number; purpose: string };
type SupportTools = {
  auras: Record<string, Aura>;
  recommendedAuras: Record<StyleId, string[]>;
  flasks: Record<StyleId, string[]>;
};
type Catalog = {
  classes: ClassOption[];
  styles: Record<StyleId, StyleOption>;
  stageDetails: Record<StyleId, StageDetail[]>;
  passiveGuides: Record<StyleId, PassiveGuide>;
  gemGuides: Record<StyleId, GemGuide>;
  bossGuides: Record<StyleId, BossGuide>;
  supportTools: SupportTools;
};

type Readiness = { life: number; fire: number; cold: number; lightning: number; links: number; bossesFeelOk: boolean };
type SavedProgress = {
  version: 2;
  classId: ClassId;
  styleId: StyleId;
  level: number;
  act: number;
  showPlan: boolean;
  completedTaskIds: string[];
  linkCount: number;
  readiness: Readiness;
  selectedAuras: string[];
  totalMana: number;
  itemText: string;
};

const progressKey = "exile-path-progress-v2";
const dataFiles = {
  classes: "data/classes.json",
  styles: "data/styles.json",
  stageDetails: "data/stage-details.json",
  passiveGuides: "data/passive-guides.json",
  gemGuides: "data/gem-guides.json",
  bossGuides: "data/boss-guides.json",
  supportTools: "data/support-tools.json",
} as const;
const defaultReadiness: Readiness = { life: 0, fire: 0, cold: 0, lightning: 0, links: 3, bossesFeelOk: false };

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json() as Promise<T>;
}

async function loadCatalog(): Promise<Catalog> {
  const [classes, styles, stageDetails, passiveGuides, gemGuides, bossGuides, supportTools] = await Promise.all([
    fetchJson<ClassOption[]>(dataFiles.classes),
    fetchJson<Record<StyleId, StyleOption>>(dataFiles.styles),
    fetchJson<Record<StyleId, StageDetail[]>>(dataFiles.stageDetails),
    fetchJson<Record<StyleId, PassiveGuide>>(dataFiles.passiveGuides),
    fetchJson<Record<StyleId, GemGuide>>(dataFiles.gemGuides),
    fetchJson<Record<StyleId, BossGuide>>(dataFiles.bossGuides),
    fetchJson<SupportTools>(dataFiles.supportTools),
  ]);
  return { classes, styles, stageDetails, passiveGuides, gemGuides, bossGuides, supportTools };
}

function getStageIndex(level: number) {
  if (level <= 12) return 0;
  if (level <= 31) return 1;
  if (level <= 67) return 2;
  return 3;
}

function getReadinessTargets(level: number, act: number) {
  const life = level < 40 ? 1000 : level < 55 ? 1700 : level < 68 ? 2500 : 3500;
  const resistance = act >= 6 ? 75 : 60;
  const links = level < 18 ? 3 : level < 55 ? 4 : 5;
  return { life, resistance, links };
}

function analyzeItem(text: string, level: number) {
  if (text.trim().length < 10) return null;
  const life = [...text.matchAll(/\+(\d+)\s+к максимуму здоровья/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const resistances = [...text.matchAll(/\+(\d+)%\s+к сопротивлен/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const allResistance = Number(text.match(/\+(\d+)%\s+ко всем сопротивлениям стихиям/i)?.[1] ?? 0) * 3;
  const movement = Number(text.match(/(\d+)%\s+увеличение скорости передвижения/i)?.[1] ?? 0);
  const physical = text.match(/Физический урон:\s*(\d+)-(\d+)/i);
  const attacks = Number(text.match(/Атак в секунду:\s*([\d.,]+)/i)?.[1]?.replace(",", ".") ?? 0);
  const reasons: Array<{ good: boolean; text: string }> = [];

  if (physical && attacks) {
    const pdps = Math.round(((Number(physical[1]) + Number(physical[2])) / 2) * attacks);
    const target = level < 40 ? 100 : level < 68 ? 250 : 350;
    reasons.push({ good: pdps >= target, text: `Физический DPS оружия: примерно ${pdps}; ориентир для этапа — ${target}+.` });
  }
  if (life > 0) reasons.push({ good: life >= (level < 55 ? 45 : 70), text: `Максимум здоровья на предмете: +${life}.` });
  else reasons.push({ good: false, text: "Не найден бонус к максимуму здоровья." });
  if (resistances + allResistance > 0) reasons.push({ good: resistances + allResistance >= 30, text: `Суммарно найдено около ${resistances + allResistance}% сопротивлений.` });
  if (movement > 0) reasons.push({ good: movement >= 20, text: `Скорость передвижения: ${movement}%.` });

  const score = reasons.reduce((total, reason) => total + (reason.good ? 1 : 0), 0);
  const verdict = score >= Math.max(2, reasons.length - 1) ? "Подходит для текущего этапа" : score >= 1 ? "Ситуативное улучшение" : "Слабый кандидат";
  return { verdict, tone: score >= Math.max(2, reasons.length - 1) ? "good" : score >= 1 ? "mixed" : "bad", reasons: reasons.slice(0, 3) };
}

function ToolPanel({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <details className="tool-panel">
      <summary><span>{number}</span><div><strong>{title}</strong><small>{subtitle}</small></div><i aria-hidden="true">＋</i></summary>
      <div className="tool-content">{children}</div>
    </details>
  );
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [classId, setClassId] = useState<ClassId>("marauder");
  const [styleId, setStyleId] = useState<StyleId>("melee");
  const [level, setLevel] = useState(1);
  const [act, setAct] = useState(1);
  const [showPlan, setShowPlan] = useState(false);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [linkCount, setLinkCount] = useState(3);
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [selectedAuras, setSelectedAuras] = useState<string[]>([]);
  const [totalMana, setTotalMana] = useState(500);
  const [itemText, setItemText] = useState("");

  const selectedClass = catalog?.classes.find((item) => item.id === classId);
  const selectedStyle = catalog?.styles[styleId];
  const stageIndex = getStageIndex(level);
  const currentStage = selectedStyle?.stages[stageIndex];
  const itemAnalysis = useMemo(() => analyzeItem(itemText, level), [itemText, level]);

  const requestCatalog = useCallback(async () => {
    setLoadState("loading");
    try {
      const nextCatalog = await loadCatalog();
      const firstClass = nextCatalog.classes[0];
      if (!firstClass || !firstClass.styles[0]) throw new Error("Каталог классов пуст");

      let saved: Partial<SavedProgress> | null = null;
      try { saved = JSON.parse(window.localStorage.getItem(progressKey) ?? "null") as Partial<SavedProgress> | null; } catch { saved = null; }
      const savedClass = nextCatalog.classes.find((item) => item.id === saved?.classId) ?? firstClass;
      const savedStyle = savedClass.styles.includes(saved?.styleId as StyleId) ? saved?.styleId as StyleId : savedClass.styles[0];

      setCatalog(nextCatalog);
      setClassId(savedClass.id);
      setStyleId(savedStyle);
      setLevel(Math.min(100, Math.max(1, Number(saved?.level) || 1)));
      setAct(Math.min(11, Math.max(1, Number(saved?.act) || 1)));
      setShowPlan(Boolean(saved?.showPlan));
      setCompletedTaskIds(Array.isArray(saved?.completedTaskIds) ? saved.completedTaskIds : []);
      setLinkCount(Math.min(6, Math.max(3, Number(saved?.linkCount) || 3)));
      setReadiness(saved?.readiness ? { ...defaultReadiness, ...saved.readiness } : defaultReadiness);
      setSelectedAuras(Array.isArray(saved?.selectedAuras) ? saved.selectedAuras : [nextCatalog.supportTools.recommendedAuras[savedStyle][0]]);
      setTotalMana(Math.max(1, Number(saved?.totalMana) || 500));
      setItemText(typeof saved?.itemText === "string" ? saved.itemText : "");
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("exile-path-theme") as Theme | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initial = stored === "dark" || stored === "light" ? stored : preferred;
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);
  useEffect(() => { void requestCatalog(); }, [requestCatalog]);
  useEffect(() => {
    if (loadState !== "ready") return;
    const saved: SavedProgress = { version: 2, classId, styleId, level, act, showPlan, completedTaskIds, linkCount, readiness, selectedAuras, totalMana, itemText };
    window.localStorage.setItem(progressKey, JSON.stringify(saved));
  }, [act, classId, completedTaskIds, itemText, level, linkCount, loadState, readiness, selectedAuras, showPlan, styleId, totalMana]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem("exile-path-theme", next);
  };
  const chooseClass = (nextClass: ClassOption) => {
    const nextStyle = nextClass.styles[0];
    setClassId(nextClass.id); setStyleId(nextStyle); setShowPlan(false);
    if (catalog) setSelectedAuras([catalog.supportTools.recommendedAuras[nextStyle][0]]);
  };
  const chooseStyle = (nextStyle: StyleId) => {
    setStyleId(nextStyle); setShowPlan(false);
    if (catalog) setSelectedAuras([catalog.supportTools.recommendedAuras[nextStyle][0]]);
  };
  const buildPlan = () => {
    setShowPlan(true);
    window.setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const toggleTask = (id: string) => setCompletedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const journey = catalog && selectedClass && selectedStyle && currentStage ? (() => {
    const gemGuide = catalog.gemGuides[styleId];
    const passive = catalog.passiveGuides[styleId].milestones[stageIndex];
    const targets = getReadinessTargets(level, act);
    const tasks = [
      { id: `${styleId}-${stageIndex}-link`, title: `Собери связку с «${gemGuide.mainByStage[stageIndex]}»`, detail: `Начни с ${Math.max(3, Math.min(linkCount, 4))} связанных гнёзд и добавляй поддержки по порядку.` },
      { id: `${styleId}-${stageIndex}-passive`, title: `Возьми «${passive.nodes[0]}»`, detail: `${passive.title}: затем двигайся к «${passive.nodes[1]}».` },
      { id: `${styleId}-${stageIndex}-defence`, title: `Проверь защиту перед продолжением`, detail: `Ориентир: ${targets.life} здоровья, ${targets.resistance}% сопротивлений и ${targets.links}L.` },
    ];
    const complete = tasks.filter((task) => completedTaskIds.includes(task.id)).length;
    return { gemGuide, passive, targets, tasks, complete };
  })() : null;

  const readinessResult = journey ? (() => {
    const checks = [
      readiness.life >= journey.targets.life,
      readiness.fire >= journey.targets.resistance && readiness.cold >= journey.targets.resistance && readiness.lightning >= journey.targets.resistance,
      readiness.links >= journey.targets.links,
      readiness.bossesFeelOk,
    ];
    const passed = checks.filter(Boolean).length;
    return { passed, label: passed === 4 ? "Готов двигаться дальше" : passed >= 2 ? "Почти готов" : "Сначала укрепи основу" };
  })() : null;

  const auraReservation = catalog ? selectedAuras.reduce((sum, id) => sum + (catalog.supportTools.auras[id]?.reservation ?? 0), 0) : 0;
  const freeMana = Math.max(0, Math.round(totalMana * (100 - auraReservation) / 100));

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Exile Path Путеводитель — на главную"><span className="brand-mark">EP</span><span className="brand-copy"><span>Exile Path</span><small>Путеводитель</small></span></a>
        <nav className="header-nav" aria-label="Основная навигация"><a href="#builder">Конструктор</a><a href="#how-it-works">Как это работает</a><span className="beta-pill">Тестовая версия</span><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "light" ? "Включить тёмную тему" : "Включить светлую тему"}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span></button></nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow"><span /> Твой маршрут по Рэкласту</p><h1>Собери персонажа<br />без лишней <em>сложности</em></h1><p className="hero-text">Выбери класс и любимый стиль игры — получи понятную цепочку навыков от первого акта до карт.</p><div className="hero-facts" aria-label="Преимущества"><span><b>✓</b> Три шага за раз</span><span><b>✓</b> Прогресс сохраняется</span><span><b>✓</b> Подходит новичкам</span></div></div>
        <aside className="route-preview" aria-label="Пример маршрута развития"><div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" /><div className="preview-card preview-card-back"><span>Акт 6–10</span><strong>Основная связка</strong></div><div className="preview-card preview-card-main"><div className="preview-topline"><span className="preview-level">УРОВЕНЬ 32</span><span>02 / 04</span></div><div className="skill-glyph" aria-hidden="true">✦</div><p>Основной навык</p><h2>Костолом</h2><div className="mini-tags"><span>Физический</span><span>Ближний бой</span></div><div className="preview-progress"><i /></div><small>Следующий этап: уровень 68</small></div><span className="floating-note note-one">+ здоровье</span><span className="floating-note note-two">+ броня</span></aside>
      </section>

      <section className="builder-section" id="builder">
        <div className="section-heading"><p className="section-kicker">Начнём с главного</p><h2>Как ты хочешь играть?</h2><p>Класс, стиль и текущий этап — остальное соберём сами.</p></div>
        {loadState === "loading" && <div className="data-state" role="status"><span className="data-spinner" aria-hidden="true" /><h3>Загружаем каталог</h3><p>Классы, связки и дерево пассивов уже в пути.</p></div>}
        {loadState === "error" && <div className="data-state data-state-error" role="alert"><span aria-hidden="true">!</span><h3>Каталог не загрузился</h3><p>Проверь соединение и попробуй ещё раз.</p><button className="secondary-button" type="button" onClick={() => void requestCatalog()}>Повторить</button></div>}

        {loadState === "ready" && catalog && selectedClass && selectedStyle && (
          <div className="builder-card">
            <div className="builder-step"><div className="step-heading"><span className="step-number">01</span><div><h3>Выбери класс</h3><p>Он определит стартовую точку на дереве умений</p></div></div><div className="class-grid" role="group" aria-label="Выбор класса">{catalog.classes.map((item) => <button key={item.id} type="button" className={`class-option ${classId === item.id ? "is-selected" : ""}`} onClick={() => chooseClass(item)} aria-pressed={classId === item.id}><span className="class-monogram">{item.short}</span><span><strong>{item.name}</strong><small>{item.stats}</small></span><i aria-hidden="true">✓</i></button>)}</div></div>
            <div className="builder-divider" />
            <div className="builder-step"><div className="step-heading"><span className="step-number">02</span><div><h3>Выбери стиль игры</h3><p>Доступные варианты хорошо сочетаются с классом</p></div></div><div className="style-grid" role="group" aria-label="Выбор стиля игры">{selectedClass.styles.map((id) => { const style = catalog.styles[id]; return <button key={id} type="button" className={`style-option ${styleId === id ? "is-selected" : ""}`} onClick={() => chooseStyle(id)} aria-pressed={styleId === id} style={{ "--style-color": style.color } as CSSProperties}><span className="style-dot" /><span><strong>{style.name}</strong><small>{style.description}</small></span><span className="difficulty">{style.difficulty}</span></button>; })}</div></div>
            <div className="builder-divider" />
            <div className="builder-step stage-picker"><div className="step-heading"><span className="step-number">03</span><div><h3>Где ты сейчас?</h3><p>Это нужно только для ближайших рекомендаций</p></div></div><div className="stage-fields"><label><span>Уровень</span><input type="number" min="1" max="100" value={level} onChange={(event) => setLevel(Math.min(100, Math.max(1, Number(event.target.value))))} /></label><label><span>Этап</span><select value={act} onChange={(event) => setAct(Number(event.target.value))}>{Array.from({ length: 10 }, (_, index) => <option value={index + 1} key={index + 1}>Акт {index + 1}</option>)}<option value="11">Карты</option></select></label><div className="stage-result"><span>Текущий этап</span><strong>{selectedStyle.stages[getStageIndex(level)].title}</strong></div></div></div>
            <div className="builder-action"><div className="selection-summary"><span>Твой выбор</span><strong>{selectedClass.name} <i>→</i> {selectedStyle.name} <i>→</i> ур. {level}</strong></div><button className="primary-button" type="button" onClick={buildPlan}>Продолжить путь <span aria-hidden="true">→</span></button></div>
          </div>
        )}
      </section>

      {showPlan && catalog && selectedClass && selectedStyle && currentStage && journey && readinessResult && (
        <section className="plan-section" id="plan">
          <div className="plan-heading"><div><p className="section-kicker">Ты сейчас здесь</p><h2>{selectedClass.name}: {selectedStyle.name}</h2><p>Уровень {level} · {act === 11 ? "Карты" : `Акт ${act}`} · следующий ориентир: <b>{currentStage.title}</b></p></div><button className="secondary-button" type="button" onClick={() => document.getElementById("builder")?.scrollIntoView({ behavior: "smooth" })}>Изменить профиль</button></div>

          <div className="journey-card">
            <div className="journey-progress"><div><span>Ближайшие шаги</span><strong>{journey.complete} из 3 готово</strong></div><div className="progress-track"><i style={{ width: `${journey.complete / 3 * 100}%` }} /></div></div>
            <div className="next-actions">{journey.tasks.map((task) => { const done = completedTaskIds.includes(task.id); return <label className={`next-action ${done ? "is-done" : ""}`} key={task.id}><input type="checkbox" checked={done} onChange={() => toggleTask(task.id)} /><span className="action-check" aria-hidden="true">✓</span><span><strong>{task.title}</strong><small>{task.detail}</small></span></label>; })}</div>
            {journey.complete > 0 && <button className="text-button" type="button" onClick={() => setCompletedTaskIds((current) => current.filter((id) => !journey.tasks.some((task) => task.id === id)))}>Сбросить отметки этапа</button>}
          </div>

          <div className="tools-heading"><p className="section-kicker">Когда понадобится</p><h2>Открой только нужную подсказку</h2></div>
          <div className="tools-list">
            <ToolPanel number="01" title="Связка камней" subtitle={`${linkCount} связанных гнёзд · ${journey.gemGuide.mainByStage[stageIndex]}`}>
              <div className="segmented" role="group" aria-label="Количество связанных гнёзд">{[3, 4, 5, 6].map((count) => <button type="button" key={count} className={linkCount === count ? "is-active" : ""} onClick={() => setLinkCount(count)}>{count}L</button>)}</div>
              <div className="gem-chain">{[journey.gemGuide.mainByStage[stageIndex], ...journey.gemGuide.supports].slice(0, linkCount).map((gem, index) => <span key={gem} className={index === 0 ? "is-main" : ""}>{gem}{index < linkCount - 1 && <i aria-hidden="true">＋</i>}</span>)}</div>
              <p className="tool-note">{journey.gemGuide.alternative}</p>
              <div className="warning-list">{journey.gemGuide.warnings.map((warning) => <div key={warning.gem}><span>!</span><p><strong>{warning.gem}</strong>{warning.rule}</p></div>)}</div>
            </ToolPanel>

            <ToolPanel number="02" title="Следующий пассив" subtitle={`${journey.passive.points} очков · ${journey.passive.nodes[0]}`}>
              <div className="next-passive"><span>Бери следующим</span><h3>{journey.passive.nodes[0]}</h3><p>{journey.passive.purpose}</p></div>
              <div className="passive-mini-route">{catalog.passiveGuides[styleId].milestones.map((milestone, index) => <div key={milestone.points} className={index === stageIndex ? "is-current" : ""}><span>{milestone.points}</span><strong>{milestone.title}</strong><small>{milestone.nodes.join(" → ")}</small></div>)}</div>
              <p className="tool-note"><b>Правило:</b> {catalog.passiveGuides[styleId].rule}</p>
            </ToolPanel>

            <ToolPanel number="03" title="Режим «Босс»" subtitle="Четыре действия без лишней теории">
              <ol className="boss-steps">{catalog.bossGuides[styleId].steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
              <div className="boss-mistake"><span>Не делай так</span><p>{catalog.bossGuides[styleId].mistake}</p></div>
            </ToolPanel>

            <ToolPanel number="04" title="Проверка готовности" subtitle={`${readinessResult.passed}/4 условий · ${readinessResult.label}`}>
              <div className="readiness-result"><div className={`readiness-score score-${readinessResult.passed}`}>{readinessResult.passed}/4</div><div><strong>{readinessResult.label}</strong><span>Ориентиры зависят от уровня и текущего акта.</span></div></div>
              <div className="readiness-grid"><label><span>Здоровье <small>цель {journey.targets.life}</small></span><input type="number" min="0" value={readiness.life || ""} placeholder="0" onChange={(event) => setReadiness({ ...readiness, life: Number(event.target.value) })} /></label>{(["fire", "cold", "lightning"] as const).map((key) => <label key={key}><span>{key === "fire" ? "Огонь" : key === "cold" ? "Холод" : "Молния"} <small>цель {journey.targets.resistance}%</small></span><input type="number" min="-60" max="90" value={readiness[key] || ""} placeholder="0" onChange={(event) => setReadiness({ ...readiness, [key]: Number(event.target.value) })} /></label>)}<label><span>Связность <small>цель {journey.targets.links}L</small></span><select value={readiness.links} onChange={(event) => setReadiness({ ...readiness, links: Number(event.target.value) })}>{[3,4,5,6].map((value) => <option value={value} key={value}>{value}L</option>)}</select></label><label className="check-field"><input type="checkbox" checked={readiness.bossesFeelOk} onChange={(event) => setReadiness({ ...readiness, bossesFeelOk: event.target.checked })} /><span>Редкие враги умирают без долгого боя</span></label></div>
            </ToolPanel>

            <ToolPanel number="05" title="Ауры и свободная мана" subtitle={`${auraReservation}% зарезервировано · примерно ${freeMana} маны свободно`}>
              <div className="mana-summary"><label><span>Всего маны</span><input type="number" min="1" value={totalMana} onChange={(event) => setTotalMana(Math.max(1, Number(event.target.value)))} /></label><div><span>Свободно</span><strong className={auraReservation >= 100 ? "is-danger" : auraReservation > 85 ? "is-warning" : ""}>{freeMana} · {Math.max(0, 100 - auraReservation)}%</strong></div></div>
              <div className="aura-list">{catalog.supportTools.recommendedAuras[styleId].map((id) => { const aura = catalog.supportTools.auras[id]; const checked = selectedAuras.includes(id); return <label key={id} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} onChange={() => setSelectedAuras((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /><span><strong>{aura.name}</strong><small>{aura.purpose}</small></span><b>{aura.reservation}%</b></label>; })}</div>
              <p className={`tool-note ${auraReservation >= 100 ? "note-danger" : ""}`}>{auraReservation >= 100 ? "Эта комбинация не оставляет ману для основной связки. Отключи одну ауру или возьми эффективность резервирования." : auraReservation > 85 ? "Маны останется мало: проверь стоимость основной атаки и источник восстановления." : "Запас выглядит комфортно для основной связки."}</p>
            </ToolPanel>

            <ToolPanel number="06" title="Быстрая проверка предмета" subtitle={itemAnalysis?.verdict ?? "Вставь описание предмета из игры"}>
              <label className="item-input"><span>Описание предмета</span><textarea value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Скопируй предмет в игре и вставь сюда…" rows={7} /></label>
              {itemAnalysis && <div className={`item-verdict verdict-${itemAnalysis.tone}`}><strong>{itemAnalysis.verdict}</strong><ul>{itemAnalysis.reasons.map((reason) => <li key={reason.text}><span>{reason.good ? "✓" : "!"}</span>{reason.text}</li>)}</ul><small>Оценка предварительная: редкие механики и уникальные свойства могут изменить вывод.</small></div>}
            </ToolPanel>

            <ToolPanel number="07" title="Комплект флаконов" subtitle="Пять понятных слотов для текущего стиля">
              <div className="flask-list">{catalog.supportTools.flasks[styleId].map((flask, index) => { const id = `flask-${styleId}-${index}`; const done = completedTaskIds.includes(id); return <label key={flask} className={done ? "is-done" : ""}><input type="checkbox" checked={done} onChange={() => toggleTask(id)} /><span>{index + 1}</span><strong>{flask}</strong></label>; })}</div>
              <p className="tool-note">Сначала закрой снятие кровотечения и заморозки. Остальные защитные свойства добавляй по мере появления хороших флаконов.</p>
            </ToolPanel>

            <ToolPanel number="08" title="Полный маршрут" subtitle="Все четыре этапа — только если нужен общий план">
              <div className="timeline compact-timeline">{selectedStyle.stages.map((stage, index) => <article className="timeline-card" key={stage.levels}><div className="timeline-index"><span>{String(index + 1).padStart(2, "0")}</span></div><div className="timeline-content"><div className="timeline-top"><span>Уровни {stage.levels}</span><small>{stage.title}</small></div><h3>{stage.skills}</h3><p className="stage-focus">{stage.focus}</p><div className="stage-details"><div><span className="detail-label"><i aria-hidden="true">▶</i> Как играть</span><p>{catalog.stageDetails[styleId][index].gameplay}</p></div><div><span className="detail-label"><i aria-hidden="true">↗</i> Как работает связка</span><p>{catalog.stageDetails[styleId][index].mechanics}</p></div></div></div></article>)}</div>
            </ToolPanel>
          </div>
          <p className="demo-note">Рекомендации демонстрационные. Перед новой лигой сверяй изменения камней и дерева навыков с актуальными патчноутами.</p>
        </section>
      )}

      <section className="how-section" id="how-it-works"><p className="section-kicker">Принцип работы</p><h2>Ничего лишнего — только следующий шаг</h2><div className="how-grid"><article><span>1</span><h3>Укажи этап</h3><p>Уровень и акт помогают скрыть советы, которые пока не нужны.</p></article><article><span>2</span><h3>Выполни три шага</h3><p>Связка, пассив и защита — короткий список вместо огромного гайда.</p></article><article><span>3</span><h3>Продолжи позже</h3><p>Выбор и отметки сохраняются на этом устройстве автоматически.</p></article></div></section>
      <footer><a className="brand" href="#top" aria-label="Exile Path Путеводитель — на главную"><span className="brand-mark">EP</span><span className="brand-copy"><span>Exile Path</span><small>Путеводитель</small></span></a><p>Тестовый помощник для путешествий по Рэкласту</p><span>Не связан с Grinding Gear Games</span></footer>
    </main>
  );
}
