import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Exile Path builder", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Exile Path/);
  assert.match(html, /Как ты хочешь играть/);
  assert.match(html, /Загружаем каталог/);
  assert.doesNotMatch(html, /codex-preview/);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("keeps the build catalog in separate valid JSON files", async () => {
  const dataRoot = new URL("../public/data/", import.meta.url);
  const [classes, styles, details, passives, masteries, gems, bosses, tools, beginners] = await Promise.all([
    readFile(new URL("classes.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("styles.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("stage-details.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("passive-guides.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("mastery-guides.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("gem-guides.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("boss-guides.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("support-tools.json", dataRoot), "utf8").then(JSON.parse),
    readFile(new URL("beginner-guides.json", dataRoot), "utf8").then(JSON.parse),
  ]);

  assert.equal(classes.length, 7);
  assert.ok(Object.keys(styles).length >= 10);
  assert.deepEqual(Object.keys(details).sort(), Object.keys(styles).sort());
  assert.deepEqual(Object.keys(passives).sort(), Object.keys(styles).sort());
  assert.deepEqual(Object.keys(masteries).sort(), classes.map((classOption) => classOption.id).sort());
  assert.deepEqual(Object.keys(gems).sort(), Object.keys(styles).sort());
  assert.deepEqual(Object.keys(bosses).sort(), Object.keys(styles).sort());
  assert.deepEqual(Object.keys(beginners.transitions).sort(), Object.keys(styles).sort());
  assert.deepEqual(Object.keys(beginners.ascendancyPriorities).sort(), Object.keys(styles).sort());
  assert.equal(beginners.labs.length, 4);
  assert.equal(beginners.checkpoints.length, 4);

  for (const style of Object.values(styles)) {
    assert.equal(style.stages.length, 4);
    assert.equal(details[style.id].length, style.stages.length);
    assert.equal(passives[style.id].milestones.length, 4);
    assert.equal(gems[style.id].mainByStage.length, 4);
    assert.equal(bosses[style.id].steps.length, 4);
    assert.equal(tools.flasks[style.id].length, 5);
    assert.ok(tools.recommendedAuras[style.id].length >= 3);
  }

  for (const classOption of classes) {
    const guide = masteries[classOption.id];
    assert.equal(guide.level, 75);
    assert.equal(guide.core.length, 3);
    assert.deepEqual(Object.keys(guide.styles).sort(), [...classOption.styles].sort());
    for (const styleId of classOption.styles) assert.equal(guide.styles[styleId].length, 2);
  }
});

test("persists the beginner profile and progress locally", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /exile-path-progress-v2/);
  assert.match(page, /localStorage\.getItem\(progressKey\)/);
  assert.match(page, /localStorage\.setItem\(progressKey/);
  assert.match(page, /completedTaskIds/);
  assert.match(page, /completedLabs/);
  assert.match(page, /currentItemText/);
  assert.match(page, /candidateGemText/);
});

test("includes the six beginner helpers", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Следующие 5 пассивов/);
  assert.match(page, /Лабиринт и восхождение/);
  assert.match(page, /Контрольная точка и готовность/);
  assert.match(page, /Переход навыка и полный маршрут/);
  assert.match(page, /Сравнение двух предметов/);
  assert.match(page, /Сравнить текущий и новый камень/);
});
