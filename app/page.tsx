"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type Theme = "light" | "dark";
type ClassId = "marauder" | "ranger" | "witch" | "duelist" | "templar" | "shadow" | "scion";
type StyleId = "melee" | "ranged" | "spells" | "minions" | "totems" | "traps" | "poison" | "bleed" | "elemental" | "stormburst" | "spark" | "hybrid";

type ClassOption = {
  id: ClassId;
  name: string;
  short: string;
  image: string;
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
type MasteryRecommendation = { category: string; effect: string; reason: string };
type ClassMasteryGuide = {
  level: 75;
  summary: string;
  core: MasteryRecommendation[];
  styles: Partial<Record<StyleId, MasteryRecommendation[]>>;
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
type LabGuide = { id: string; title: string; level: number; reward: string; preparation: string };
type CheckpointGuide = { id: string; maxLevel: number; title: string; description: string; tasks: string[] };
type TransitionGuide = { from: string; to: string; level: number; keep: string; steps: string[] };
type BeginnerGuides = {
  labs: LabGuide[];
  ascendancyPriorities: Record<StyleId, string[]>;
  checkpoints: CheckpointGuide[];
  transitions: Record<StyleId, TransitionGuide>;
};
type Catalog = {
  classes: ClassOption[];
  styles: Record<StyleId, StyleOption>;
  stageDetails: Record<StyleId, StageDetail[]>;
  passiveGuides: Record<StyleId, PassiveGuide>;
  masteryGuides: Record<ClassId, ClassMasteryGuide>;
  gemGuides: Record<StyleId, GemGuide>;
  bossGuides: Record<StyleId, BossGuide>;
  supportTools: SupportTools;
  beginnerGuides: BeginnerGuides;
};

type Readiness = { life: number; fire: number; cold: number; lightning: number; links: number; bossesFeelOk: boolean };
type SavedProgress = {
  version: 5;
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
  currentItemText: string;
  itemText: string;
  currentGemText: string;
  candidateGemText: string;
  completedLabs: string[];
};

const progressKey = "exile-path-progress-v2";
const dataFiles = {
  classes: "data/classes.json",
  styles: "data/styles.json",
  stageDetails: "data/stage-details.json",
  passiveGuides: "data/passive-guides.json",
  masteryGuides: "data/mastery-guides.json",
  gemGuides: "data/gem-guides.json",
  bossGuides: "data/boss-guides.json",
  supportTools: "data/support-tools.json",
  beginnerGuides: "data/beginner-guides.json",
} as const;
const defaultReadiness: Readiness = { life: 0, fire: 0, cold: 0, lightning: 0, links: 3, bossesFeelOk: false };

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Не удалось загрузить ${path}`);
  return response.json() as Promise<T>;
}

async function loadCatalog(): Promise<Catalog> {
  const [classes, styles, stageDetails, passiveGuides, masteryGuides, gemGuides, bossGuides, supportTools, beginnerGuides] = await Promise.all([
    fetchJson<ClassOption[]>(dataFiles.classes),
    fetchJson<Record<StyleId, StyleOption>>(dataFiles.styles),
    fetchJson<Record<StyleId, StageDetail[]>>(dataFiles.stageDetails),
    fetchJson<Record<StyleId, PassiveGuide>>(dataFiles.passiveGuides),
    fetchJson<Record<ClassId, ClassMasteryGuide>>(dataFiles.masteryGuides),
    fetchJson<Record<StyleId, GemGuide>>(dataFiles.gemGuides),
    fetchJson<Record<StyleId, BossGuide>>(dataFiles.bossGuides),
    fetchJson<SupportTools>(dataFiles.supportTools),
    fetchJson<BeginnerGuides>(dataFiles.beginnerGuides),
  ]);
  return { classes, styles, stageDetails, passiveGuides, masteryGuides, gemGuides, bossGuides, supportTools, beginnerGuides };
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
  const links = level < 32 ? 3 : level < 55 ? 4 : 5;
  return { life, resistance, links };
}

function getItemStats(text: string) {
  if (text.trim().length < 10) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rarityIndex = lines.findIndex((line) => line.startsWith("Редкость:"));
  const name = rarityIndex >= 0 ? lines[rarityIndex + 1] ?? "Предмет" : "Предмет";
  const life = [...text.matchAll(/\+(\d+)\s+к максимуму здоровья/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const resistances = [...text.matchAll(/\+(\d+)%\s+к сопротивлен/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const allResistance = Number(text.match(/\+(\d+)%\s+ко всем сопротивлениям стихиям/i)?.[1] ?? 0) * 3;
  const movement = Number(text.match(/(\d+)%\s+увеличение скорости передвижения/i)?.[1] ?? 0);
  const physical = text.match(/Физический урон:\s*(\d+)-(\d+)/i);
  const attacks = Number(text.match(/Атак в секунду:\s*([\d.,]+)/i)?.[1]?.replace(",", ".") ?? 0);
  const elementalLine = text.match(/Урон от стихий:\s*([^\n]+)/i)?.[1] ?? "";
  const elementalAverage = [...elementalLine.matchAll(/(\d+)-(\d+)/g)].reduce((sum, match) => sum + (Number(match[1]) + Number(match[2])) / 2, 0);
  const physicalAverage = physical ? (Number(physical[1]) + Number(physical[2])) / 2 : 0;
  const weaponDps = attacks > 0 ? Math.round((physicalAverage + elementalAverage) * attacks) : 0;
  const spellDamage = [...text.matchAll(/(\d+)%\s+увеличение урона (?:от )?чар/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const lightningDamage = [...text.matchAll(/(\d+)%\s+увеличение урона (?:от )?молни(?:ей|и)/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const castSpeed = [...text.matchAll(/(\d+)%\s+увеличение скорости сотворения чар/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const gemLevels = [...text.matchAll(/\+(\d+)\s+к уровню (?:всех )?камней[^\n]*(?:молнии|чар молнии|физических чар)/gi)].reduce((sum, match) => sum + Number(match[1]), 0);
  const spellPower = spellDamage + lightningDamage + castSpeed * 2 + gemLevels * 30;
  const requirements = text.split(/Требования:/i)[1]?.split(/--------/)[0] ?? "";
  const requiredLevel = Number(requirements.match(/Уровень:\s*(\d+)/i)?.[1] ?? 0);
  return { name, life, resistances: resistances + allResistance, movement, weaponDps, spellPower, spellDamage, lightningDamage, castSpeed, gemLevels, requiredLevel };
}

function isSpellStyle(styleId: StyleId) {
  return styleId === "spells" || styleId === "spark" || styleId === "stormburst";
}

function analyzeItem(text: string, level: number, styleId: StyleId) {
  const stats = getItemStats(text);
  if (!stats) return null;
  const reasons: Array<{ good: boolean; text: string }> = [];

  if (isSpellStyle(styleId)) {
    if (stats.spellPower > 0) reasons.push({ good: stats.spellPower >= 30, text: `Полезные свойства чар: урон ${stats.spellDamage + stats.lightningDamage}%, скорость ${stats.castSpeed}%, уровни камней +${stats.gemLevels}.` });
    else reasons.push({ good: false, text: "Не найдены урон чар или молнии, скорость сотворения либо уровни подходящих камней." });
    if (stats.weaponDps > 0) reasons.push({ good: false, text: "Физический DPS и скорость атаки оружия не усиливают основное заклинание." });
  } else if (stats.weaponDps > 0) {
    const target = level < 40 ? 100 : level < 68 ? 250 : 350;
    reasons.push({ good: stats.weaponDps >= target, text: `Суммарный DPS оружия: примерно ${stats.weaponDps}; ориентир для этапа — ${target}+.` });
  }
  if (stats.life > 0) reasons.push({ good: stats.life >= (level < 55 ? 45 : 70), text: `Максимум здоровья на предмете: +${stats.life}.` });
  else reasons.push({ good: false, text: "Не найден бонус к максимуму здоровья." });
  if (stats.resistances > 0) reasons.push({ good: stats.resistances >= 30, text: `Суммарно найдено около ${stats.resistances}% сопротивлений.` });
  if (stats.movement > 0) reasons.push({ good: stats.movement >= 20, text: `Скорость передвижения: ${stats.movement}%.` });
  if (stats.requiredLevel > level) reasons.unshift({ good: false, text: `Пока нельзя надеть: требуется ${stats.requiredLevel} уровень.` });

  const score = reasons.reduce((total, reason) => total + (reason.good ? 1 : 0), 0);
  const blocked = stats.requiredLevel > level;
  const verdict = blocked ? "Оставь на следующий уровень" : score >= Math.max(2, reasons.length - 1) ? "Подходит для текущего этапа" : score >= 1 ? "Ситуативное улучшение" : "Слабый кандидат";
  return { verdict, tone: blocked ? "mixed" : score >= Math.max(2, reasons.length - 1) ? "good" : score >= 1 ? "mixed" : "bad", reasons: reasons.slice(0, 3) };
}

function compareItems(currentText: string, candidateText: string, level: number, styleId: StyleId) {
  const current = getItemStats(currentText);
  const candidate = getItemStats(candidateText);
  if (!current || !candidate) return null;
  const spellComparison = isSpellStyle(styleId) && (current.spellPower > 0 || candidate.spellPower > 0);
  const weaponComparison = !isSpellStyle(styleId) && (current.weaponDps > 0 || candidate.weaponDps > 0);
  const currentScore = spellComparison ? current.spellPower : weaponComparison ? current.weaponDps : current.life + current.resistances * 1.5 + current.movement;
  const candidateScore = spellComparison ? candidate.spellPower : weaponComparison ? candidate.weaponDps : candidate.life + candidate.resistances * 1.5 + candidate.movement;
  const delta = currentScore > 0 ? Math.round((candidateScore - currentScore) / currentScore * 100) : candidateScore > 0 ? 100 : 0;
  const reasons: Array<{ good: boolean; text: string }> = [];
  if (spellComparison) reasons.push({ good: candidate.spellPower >= current.spellPower, text: `Полезные свойства чар: ${current.spellPower || "—"} → ${candidate.spellPower || "—"} условных очков (${delta >= 0 ? "+" : ""}${delta}%).` });
  else if (weaponComparison) reasons.push({ good: candidate.weaponDps >= current.weaponDps, text: `DPS оружия: ${current.weaponDps || "—"} → ${candidate.weaponDps || "—"} (${delta >= 0 ? "+" : ""}${delta}%).` });
  if (candidate.life !== current.life) reasons.push({ good: candidate.life >= current.life, text: `Здоровье: +${current.life} → +${candidate.life}.` });
  if (candidate.resistances !== current.resistances) reasons.push({ good: candidate.resistances >= current.resistances, text: `Сумма сопротивлений: ${current.resistances}% → ${candidate.resistances}%.` });
  if (candidate.movement !== current.movement) reasons.push({ good: candidate.movement >= current.movement, text: `Скорость передвижения: ${current.movement}% → ${candidate.movement}%.` });
  if (candidate.requiredLevel > level) reasons.unshift({ good: false, text: `Кандидат требует ${candidate.requiredLevel} уровень — сейчас его нельзя надеть.` });
  if (reasons.length === 0) reasons.push({ good: false, text: "По базовым параметрам предметы почти одинаковы; проверь особые свойства вручную." });
  const blocked = candidate.requiredLevel > level;
  const verdict = blocked ? "Кандидат лучше сохранить на потом" : delta >= 10 ? "Кандидат выглядит сильнее" : delta <= -10 ? "Текущий предмет лучше" : "Замена ситуативная";
  const tone = blocked || Math.abs(delta) < 10 ? "mixed" : delta > 0 ? "good" : "bad";
  return { verdict, tone, reasons: reasons.slice(0, 3), currentName: current.name, candidateName: candidate.name };
}

function getGemStats(text: string) {
  if (text.trim().length < 10) return null;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rarityIndex = lines.findIndex((line) => line.startsWith("Редкость:"));
  const name = rarityIndex >= 0 ? lines[rarityIndex + 1] ?? "Камень" : "Камень";
  const level = Number(text.match(/(?:^|\n)Уровень:\s*(\d+)/i)?.[1] ?? 1);
  const quality = Number(text.match(/(?:^|\n)Качество:\s*\+?(\d+)%/i)?.[1] ?? 0);
  return { name, level, quality, vaal: /(?:^|\n).*ваал/im.test(text), corrupted: /Осквернено/i.test(text) };
}

function compareGems(currentText: string, candidateText: string) {
  const current = getGemStats(currentText);
  const candidate = getGemStats(candidateText);
  if (!current || !candidate) return null;
  const levelGap = current.level - candidate.level;
  const reasons: string[] = [`Уровень: ${current.level} → ${candidate.level}.`, `Качество: ${current.quality}% → ${candidate.quality}%.`];
  if (candidate.corrupted) reasons.push("Камень осквернён: обычное улучшение качества недоступно.");
  if (candidate.vaal && !current.vaal) reasons.push("Новый камень даёт дополнительную ваал-версию умения.");
  if (levelGap >= 3) return { verdict: "Прокачивай новый камень во втором комплекте", tone: "mixed", reasons: reasons.slice(0, 3) };
  if (candidate.level > current.level || candidate.quality >= current.quality + 10 || (candidate.vaal && candidate.level >= current.level - 2)) return { verdict: "Можно переходить на новый камень", tone: "good", reasons: reasons.slice(0, 3) };
  return { verdict: "Пока оставь текущий камень", tone: "bad", reasons: reasons.slice(0, 3) };
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
  const [classId, setClassId] = useState<ClassId>("scion");
  const [styleId, setStyleId] = useState<StyleId>("stormburst");
  const [level, setLevel] = useState(22);
  const [act, setAct] = useState(2);
  const [showPlan, setShowPlan] = useState(true);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [linkCount, setLinkCount] = useState(3);
  const [readiness, setReadiness] = useState<Readiness>(defaultReadiness);
  const [selectedAuras, setSelectedAuras] = useState<string[]>([]);
  const [totalMana, setTotalMana] = useState(500);
  const [currentItemText, setCurrentItemText] = useState("");
  const [itemText, setItemText] = useState("");
  const [currentGemText, setCurrentGemText] = useState("");
  const [candidateGemText, setCandidateGemText] = useState("");
  const [completedLabs, setCompletedLabs] = useState<string[]>([]);

  const selectedClass = catalog?.classes.find((item) => item.id === classId);
  const selectedStyle = catalog?.styles[styleId];
  const stageIndex = getStageIndex(level);
  const currentStage = selectedStyle?.stages[stageIndex];
  const itemAnalysis = useMemo(() => analyzeItem(itemText, level, styleId), [itemText, level, styleId]);
  const itemComparison = useMemo(() => compareItems(currentItemText, itemText, level, styleId), [currentItemText, itemText, level, styleId]);
  const gemComparison = useMemo(() => compareGems(currentGemText, candidateGemText), [currentGemText, candidateGemText]);

  const requestCatalog = useCallback(async () => {
    setLoadState("loading");
    try {
      const nextCatalog = await loadCatalog();
      const firstClass = nextCatalog.classes[0];
      if (!firstClass || !firstClass.styles[0]) throw new Error("Каталог классов пуст");
      const personalizedClass = nextCatalog.classes.find((item) => item.id === "scion") ?? firstClass;

      let saved: Partial<SavedProgress> | null = null;
      try { saved = JSON.parse(window.localStorage.getItem(progressKey) ?? "null") as Partial<SavedProgress> | null; } catch { saved = null; }
      const hasPersonalizedSave = saved?.version === 5;
      const savedClass = hasPersonalizedSave ? nextCatalog.classes.find((item) => item.id === saved?.classId) ?? personalizedClass : personalizedClass;
      const savedStyle = hasPersonalizedSave && savedClass.styles.includes(saved?.styleId as StyleId) ? saved?.styleId as StyleId : savedClass.styles.includes("stormburst") ? "stormburst" : savedClass.styles[0];

      setCatalog(nextCatalog);
      setClassId(savedClass.id);
      setStyleId(savedStyle);
      setLevel(hasPersonalizedSave ? Math.min(100, Math.max(1, Number(saved?.level) || 22)) : 22);
      setAct(hasPersonalizedSave ? Math.min(11, Math.max(1, Number(saved?.act) || 2)) : 2);
      setShowPlan(hasPersonalizedSave ? Boolean(saved?.showPlan) : true);
      setCompletedTaskIds(hasPersonalizedSave && Array.isArray(saved?.completedTaskIds) ? saved.completedTaskIds : []);
      setLinkCount(hasPersonalizedSave ? Math.min(6, Math.max(3, Number(saved?.linkCount) || 3)) : 3);
      setReadiness(hasPersonalizedSave && saved?.readiness ? { ...defaultReadiness, ...saved.readiness } : defaultReadiness);
      setSelectedAuras(hasPersonalizedSave && Array.isArray(saved?.selectedAuras) ? saved.selectedAuras : [nextCatalog.supportTools.recommendedAuras[savedStyle][0]]);
      setTotalMana(Math.max(1, Number(saved?.totalMana) || 500));
      setCurrentItemText(hasPersonalizedSave && typeof saved?.currentItemText === "string" ? saved.currentItemText : "");
      setItemText(hasPersonalizedSave && typeof saved?.itemText === "string" ? saved.itemText : "");
      setCurrentGemText(hasPersonalizedSave && typeof saved?.currentGemText === "string" ? saved.currentGemText : "");
      setCandidateGemText(hasPersonalizedSave && typeof saved?.candidateGemText === "string" ? saved.candidateGemText : "");
      setCompletedLabs(hasPersonalizedSave && Array.isArray(saved?.completedLabs) ? saved.completedLabs : []);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("exile-path-theme") as Theme | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initial = stored === "dark" || stored === "light" ? stored : preferred;
    const frame = window.requestAnimationFrame(() => {
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void requestCatalog());
    return () => window.cancelAnimationFrame(frame);
  }, [requestCatalog]);
  useEffect(() => {
    if (loadState !== "ready") return;
    const saved: SavedProgress = { version: 5, classId, styleId, level, act, showPlan, completedTaskIds, linkCount, readiness, selectedAuras, totalMana, currentItemText, itemText, currentGemText, candidateGemText, completedLabs };
    window.localStorage.setItem(progressKey, JSON.stringify(saved));
  }, [act, candidateGemText, classId, completedLabs, completedTaskIds, currentGemText, currentItemText, itemText, level, linkCount, loadState, readiness, selectedAuras, showPlan, styleId, totalMana]);

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
    const masteryGuide = catalog.masteryGuides[classId];
    const masteries = [...masteryGuide.core, ...(masteryGuide.styles[styleId] ?? [])];
    const passiveCandidates = catalog.passiveGuides[styleId].milestones.flatMap((milestone, index) => index >= stageIndex ? milestone.nodes.map((node) => ({ node, source: milestone.title })) : []);
    const masteryCandidates = masteries.map((mastery) => ({ node: mastery.category, source: "Подходящее мастерство" }));
    const nextPassives = [...passiveCandidates, ...masteryCandidates].filter((item, index, items) => items.findIndex((candidate) => candidate.node === item.node) === index).slice(0, 5);
    const checkpoint = catalog.beginnerGuides.checkpoints.find((item) => level <= item.maxLevel) ?? catalog.beginnerGuides.checkpoints.at(-1)!;
    const transition = catalog.beginnerGuides.transitions[styleId];
    const nextLabIndex = catalog.beginnerGuides.labs.findIndex((lab) => !completedLabs.includes(lab.id));
    const labsComplete = nextLabIndex === -1;
    const labIndex = nextLabIndex === -1 ? catalog.beginnerGuides.labs.length - 1 : nextLabIndex;
    const nextLab = catalog.beginnerGuides.labs[labIndex];
    const targets = getReadinessTargets(level, act);
    const tasks = [
      { id: `${styleId}-${stageIndex}-link`, title: `Собери связку с «${gemGuide.mainByStage[stageIndex]}»`, detail: `Начни с ${Math.max(3, Math.min(linkCount, 4))} связанных гнёзд и добавляй поддержки по порядку.` },
      { id: `${styleId}-${stageIndex}-passive`, title: `Возьми «${passive.nodes[0]}»`, detail: `${passive.title}: затем двигайся к «${passive.nodes[1]}».` },
      { id: `${styleId}-${stageIndex}-defence`, title: `Проверь защиту перед продолжением`, detail: `Ориентир: ${targets.life} здоровья, ${targets.resistance}% сопротивлений и ${targets.links}L.` },
    ];
    const complete = tasks.filter((task) => completedTaskIds.includes(task.id)).length;
    return { gemGuide, passive, masteryGuide, masteries, nextPassives, checkpoint, transition, nextLab, labIndex, labsComplete, targets, tasks, complete };
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
        <div className="hero-copy"><p className="eyebrow"><span /> Персональный маршрут по Рэкласту</p><h1>Дворянка с «Грозовым взрывом»<br />с <em>22 уровня</em></h1><p className="hero-text">Твой путь перестроен: уже взятые скорость чар и здоровье остаются, а следующие шаги развивают длительность сфер и защиту.</p><div className="hero-facts" aria-label="Преимущества"><span><b>✓</b> Переход без полного сброса</span><span><b>✓</b> Прогресс сохраняется</span><span><b>✓</b> Подходит новичкам</span></div></div>
        <aside className="route-preview" aria-label="Пример маршрута развития"><div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" /><div className="preview-card preview-card-back"><span>С 31 уровня</span><strong>Добавь Продление</strong></div><div className="preview-card preview-card-main"><div className="preview-topline"><span className="preview-level">УРОВЕНЬ 22</span><span>ПЕРЕХОД</span></div><div className="skill-glyph" aria-hidden="true">✦</div><p>Основной навык</p><h2>Грозовой взрыв</h2><div className="mini-tags"><span>Молния</span><span>Поддерживаемое</span></div><div className="preview-progress"><i /></div><small>Следующая цель: 1,6 сек. длительности</small></div><span className="floating-note note-one">+ длительность</span><span className="floating-note note-two">+ здоровье</span></aside>
      </section>

      <section className="builder-section" id="builder">
        <div className="section-heading"><p className="section-kicker">Профиль уже настроен</p><h2>Твоя Дворянка с «Грозовым взрывом»</h2><p>Стартовая точка — 22 уровень и второй акт. Проверь значения, если уже успел продвинуться дальше.</p></div>
        {loadState === "loading" && <div className="data-state" role="status"><span className="data-spinner" aria-hidden="true" /><h3>Загружаем каталог</h3><p>Классы, связки и дерево пассивов уже в пути.</p></div>}
        {loadState === "error" && <div className="data-state data-state-error" role="alert"><span aria-hidden="true">!</span><h3>Каталог не загрузился</h3><p>Проверь соединение и попробуй ещё раз.</p><button className="secondary-button" type="button" onClick={() => void requestCatalog()}>Повторить</button></div>}

        {loadState === "ready" && catalog && selectedClass && selectedStyle && (
          <div className="builder-card">
            <div className="builder-step"><div className="step-heading"><span className="step-number">01</span><div><h3>Выбери класс</h3><p>Он определит стартовую точку на дереве умений</p></div></div><div className="class-grid" role="group" aria-label="Выбор класса">{catalog.classes.map((item) => <button key={item.id} type="button" className={`class-option ${classId === item.id ? "is-selected" : ""}`} onClick={() => chooseClass(item)} aria-pressed={classId === item.id}><Image className="class-portrait" src={item.image} alt="" width={256} height={256} draggable={false} unoptimized /><span><strong>{item.name}</strong><small>{item.stats}</small></span><i aria-hidden="true">✓</i></button>)}</div></div>
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
              <details className="mini-tool"><summary>Сравнить текущий и новый камень <span>＋</span></summary><div className="compare-inputs"><label className="item-input"><span>Текущий камень</span><textarea value={currentGemText} onChange={(event) => setCurrentGemText(event.target.value)} placeholder="Вставь описание используемого камня…" rows={6} /></label><label className="item-input"><span>Новый камень</span><textarea value={candidateGemText} onChange={(event) => setCandidateGemText(event.target.value)} placeholder="Вставь описание кандидата…" rows={6} /></label></div>{gemComparison ? <div className={`item-verdict verdict-${gemComparison.tone}`}><strong>{gemComparison.verdict}</strong><ul>{gemComparison.reasons.map((reason) => <li key={reason}><span>•</span>{reason}</li>)}</ul></div> : <p className="empty-helper">Вставь два описания — помощник учтёт уровень, качество, ваал-версию и осквернение.</p>}</details>
            </ToolPanel>

            <ToolPanel number="02" title="Следующие 5 пассивов" subtitle={`${journey.nextPassives.filter((item, index) => completedTaskIds.includes(`passive-next-${styleId}-${stageIndex}-${index}`)).length}/${journey.nextPassives.length} отмечено · ${journey.passive.points} очков`}>
              <div className="next-passive"><span>Бери следующим</span><h3>{journey.passive.nodes[0]}</h3><p>{journey.passive.purpose}</p></div>
              <div className="next-passive-list">{journey.nextPassives.map((item, index) => { const id = `passive-next-${styleId}-${stageIndex}-${index}`; const done = completedTaskIds.includes(id); return <label key={`${item.node}-${index}`} className={done ? "is-done" : ""}><input type="checkbox" checked={done} onChange={() => toggleTask(id)} /><span>{index + 1}</span><div><strong>{item.node}</strong><small>{item.source}</small></div></label>; })}</div>
              <p className="tool-note"><b>Правило:</b> {catalog.passiveGuides[styleId].rule}</p>
            </ToolPanel>

            <ToolPanel number="03" title="Лабиринт и восхождение" subtitle={`${completedLabs.length}/4 пройдено · ${journey.labsComplete ? "восхождение завершено" : `следующий: ${journey.nextLab.title}`}`}>
              <div className="lab-next"><span>{journey.labsComplete ? "Готово" : "Следующая цель"}</span><h3>{journey.labsComplete ? "Восхождение завершено" : journey.nextLab.title}</h3><p>{journey.labsComplete ? "Все восемь очков получены — возвращайся только для смены ветки или зачарования." : `Ориентир: уровень ${journey.nextLab.level} · ${journey.nextLab.reward}`}</p><strong>{selectedClass.ascendancies[styleId]}</strong><small>{catalog.beginnerGuides.ascendancyPriorities[styleId][journey.labIndex]}</small></div>
              <div className="lab-list">{catalog.beginnerGuides.labs.map((lab, index) => { const done = completedLabs.includes(lab.id); return <label key={lab.id} className={done ? "is-done" : index === journey.labIndex ? "is-current" : ""}><input type="checkbox" checked={done} onChange={() => setCompletedLabs((current) => current.includes(lab.id) ? current.filter((id) => id !== lab.id) : [...current, lab.id])} /><span>{done ? "✓" : index + 1}</span><div><strong>{lab.title}</strong><small>Ур. {lab.level} · {lab.preparation}</small></div></label>; })}</div>
            </ToolPanel>

            <ToolPanel number="04" title="Режим «Босс»" subtitle="Четыре действия без лишней теории">
              <ol className="boss-steps">{catalog.bossGuides[styleId].steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
              <div className="boss-mistake"><span>Не делай так</span><p>{catalog.bossGuides[styleId].mistake}</p></div>
            </ToolPanel>

            <ToolPanel number="05" title="Контрольная точка и готовность" subtitle={`${journey.checkpoint.title} · ${readinessResult.passed}/4 условий`}>
              <div className="checkpoint-card"><span>Сейчас важно</span><h3>{journey.checkpoint.title}</h3><p>{journey.checkpoint.description}</p><div>{journey.checkpoint.tasks.map((task, index) => { const id = `checkpoint-${journey.checkpoint.id}-${index}`; const done = completedTaskIds.includes(id); return <label key={task} className={done ? "is-done" : ""}><input type="checkbox" checked={done} onChange={() => toggleTask(id)} /><span>✓</span><strong>{task}</strong></label>; })}</div></div>
              <div className="readiness-result"><div className={`readiness-score score-${readinessResult.passed}`}>{readinessResult.passed}/4</div><div><strong>{readinessResult.label}</strong><span>Ориентиры зависят от уровня и текущего акта.</span></div></div>
              <div className="readiness-grid"><label><span>Здоровье <small>цель {journey.targets.life}</small></span><input type="number" min="0" value={readiness.life || ""} placeholder="0" onChange={(event) => setReadiness({ ...readiness, life: Number(event.target.value) })} /></label>{(["fire", "cold", "lightning"] as const).map((key) => <label key={key}><span>{key === "fire" ? "Огонь" : key === "cold" ? "Холод" : "Молния"} <small>цель {journey.targets.resistance}%</small></span><input type="number" min="-60" max="90" value={readiness[key] || ""} placeholder="0" onChange={(event) => setReadiness({ ...readiness, [key]: Number(event.target.value) })} /></label>)}<label><span>Связность <small>цель {journey.targets.links}L</small></span><select value={readiness.links} onChange={(event) => setReadiness({ ...readiness, links: Number(event.target.value) })}>{[3,4,5,6].map((value) => <option value={value} key={value}>{value}L</option>)}</select></label><label className="check-field"><input type="checkbox" checked={readiness.bossesFeelOk} onChange={(event) => setReadiness({ ...readiness, bossesFeelOk: event.target.checked })} /><span>Редкие враги умирают без долгого боя</span></label></div>
            </ToolPanel>

            <ToolPanel number="06" title="Ауры и свободная мана" subtitle={`${auraReservation}% зарезервировано · примерно ${freeMana} маны свободно`}>
              <div className="mana-summary"><label><span>Всего маны</span><input type="number" min="1" value={totalMana} onChange={(event) => setTotalMana(Math.max(1, Number(event.target.value)))} /></label><div><span>Свободно</span><strong className={auraReservation >= 100 ? "is-danger" : auraReservation > 85 ? "is-warning" : ""}>{freeMana} · {Math.max(0, 100 - auraReservation)}%</strong></div></div>
              <div className="aura-list">{catalog.supportTools.recommendedAuras[styleId].map((id) => { const aura = catalog.supportTools.auras[id]; const checked = selectedAuras.includes(id); return <label key={id} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} onChange={() => setSelectedAuras((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /><span><strong>{aura.name}</strong><small>{aura.purpose}</small></span><b>{aura.reservation}%</b></label>; })}</div>
              <p className={`tool-note ${auraReservation >= 100 ? "note-danger" : ""}`}>{auraReservation >= 100 ? "Эта комбинация не оставляет ману для основной связки. Отключи одну ауру или возьми эффективность резервирования." : auraReservation > 85 ? "Маны останется мало: проверь стоимость основной атаки и источник восстановления." : "Запас выглядит комфортно для основной связки."}</p>
            </ToolPanel>

            <ToolPanel number="07" title="Сравнение двух предметов" subtitle={itemComparison?.verdict ?? itemAnalysis?.verdict ?? "Вставь текущий предмет и кандидата"}>
              {styleId === "stormburst" && <p className="tool-note"><b>Оружие для билда:</b> жезл или скипетр со щитом. Ищи уровни камней молнии или физических чар, урон чар, скорость сотворения и добавленный урон к чарам; физический DPS оружия не работает.</p>}
              <div className="compare-inputs"><label className="item-input"><span>Сейчас надето</span><textarea value={currentItemText} onChange={(event) => setCurrentItemText(event.target.value)} placeholder="Скопируй текущий предмет из игры…" rows={7} /></label><label className="item-input"><span>Кандидат на замену</span><textarea value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Скопируй новый предмет из игры…" rows={7} /></label></div>
              {itemComparison ? <div className={`item-verdict verdict-${itemComparison.tone}`}><strong>{itemComparison.verdict}</strong><p className="comparison-name">{itemComparison.currentName} <span>→</span> {itemComparison.candidateName}</p><ul>{itemComparison.reasons.map((reason) => <li key={reason.text}><span>{reason.good ? "✓" : "!"}</span>{reason.text}</li>)}</ul><small>Оценка предварительная: особые свойства и механики билда могут изменить результат.</small></div> : itemAnalysis ? <div className={`item-verdict verdict-${itemAnalysis.tone}`}><strong>{itemAnalysis.verdict}</strong><ul>{itemAnalysis.reasons.map((reason) => <li key={reason.text}><span>{reason.good ? "✓" : "!"}</span>{reason.text}</li>)}</ul><small>Добавь текущий предмет, чтобы увидеть прямое сравнение.</small></div> : <p className="empty-helper">Можно начать только с кандидата — сайт даст предварительную оценку, а после второго описания сравнит их напрямую.</p>}
            </ToolPanel>

            <ToolPanel number="08" title="Комплект флаконов" subtitle="Пять понятных слотов для текущего стиля">
              <div className="flask-list">{catalog.supportTools.flasks[styleId].map((flask, index) => { const id = `flask-${styleId}-${index}`; const done = completedTaskIds.includes(id); return <label key={flask} className={done ? "is-done" : ""}><input type="checkbox" checked={done} onChange={() => toggleTask(id)} /><span>{index + 1}</span><strong>{flask}</strong></label>; })}</div>
              <p className="tool-note">Сначала закрой снятие кровотечения и заморозки. Остальные защитные свойства добавляй по мере появления хороших флаконов.</p>
            </ToolPanel>

            <ToolPanel number="09" title="Переход навыка и полный маршрут" subtitle={`${journey.transition.from} → ${journey.transition.to} · ориентир ур. ${journey.transition.level}`}>
              <div className="transition-card"><div><span>План перехода</span><h3>{journey.transition.from} <i>→</i> {journey.transition.to}</h3><p>{journey.transition.keep}</p></div><ol>{journey.transition.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol></div>
              <div className="timeline compact-timeline">{selectedStyle.stages.map((stage, index) => <article className="timeline-card" key={stage.levels}><div className="timeline-index"><span>{String(index + 1).padStart(2, "0")}</span></div><div className="timeline-content"><div className="timeline-top"><span>Уровни {stage.levels}</span><small>{stage.title}</small></div><h3>{stage.skills}</h3><p className="stage-focus">{stage.focus}</p><div className="stage-details"><div><span className="detail-label"><i aria-hidden="true">▶</i> Как играть</span><p>{catalog.stageDetails[styleId][index].gameplay}</p></div><div><span className="detail-label"><i aria-hidden="true">↗</i> Как работает связка</span><p>{catalog.stageDetails[styleId][index].mechanics}</p></div></div></div></article>)}</div>
            </ToolPanel>

            <ToolPanel number="10" title="Мастерства к 75 уровню" subtitle={`${journey.masteries.length} рекомендаций · ${selectedClass.name}`}>
              <div className="mastery-summary"><span>Ориентир: уровень {journey.masteryGuide.level}</span><p>{journey.masteryGuide.summary}</p></div>
              <ol className="mastery-list">{journey.masteries.map((mastery, index) => <li key={`${mastery.category}-${mastery.effect}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{mastery.category}</strong><p>{mastery.effect}</p><small>{mastery.reason}</small></div></li>)}</ol>
              <p className="tool-note"><b>Важно:</b> мастерство доступно только в уже взятом кластере. Не делай длинный обход по дереву только ради одного эффекта.</p>
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
