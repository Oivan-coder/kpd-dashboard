"use client";

import { useMemo, useState } from "react";
import type { DashboardData, VerificationStatus } from "@/lib/types";
import { StatusBadge } from "./status-badge";

function fmt(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function pct(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
}

const statusLabels: Record<VerificationStatus | "all", string> = {
  all: "Все статусы",
  verified: "Проверено",
  review: "Требует уточнения",
  error: "Ошибка",
  excluded: "Не участвует в КПД",
};

export function Dashboard({ data }: { data: DashboardData }) {
  const [lab, setLab] = useState("all");
  const [level, setLevel] = useState("all");
  const [direction, setDirection] = useState("all");
  const [manufacturer, setManufacturer] = useState("all");
  const [status, setStatus] = useState<VerificationStatus | "all">("review");
  const [search, setSearch] = useState("");

  const directions = useMemo(() => [...new Set(data.analyzers.map((x) => x.direction).filter(Boolean))].sort(), [data.analyzers]);
  const manufacturers = useMemo(() => [...new Set(data.analyzers.map((x) => x.manufacturer).filter(Boolean))].sort(), [data.analyzers]);
  const levels = useMemo(() => [...new Set(data.analyzers.map((x) => x.level).filter(Boolean))].sort(), [data.analyzers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.analyzers.filter((x) => {
      if (lab !== "all" && x.laboratory !== lab) return false;
      if (level !== "all" && x.level !== level) return false;
      if (direction !== "all" && x.direction !== direction) return false;
      if (manufacturer !== "all" && x.manufacturer !== manufacturer) return false;
      if (status !== "all" && x.status !== status) return false;
      if (q && ![x.laboratory, x.direction, x.manufacturer, x.model, x.serials.join(" "), x.issue ?? ""].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.analyzers, lab, level, direction, manufacturer, status, search]);

  const reviewTotal = data.analyzers.filter((x) => x.status === "review").length;
  const errorTotal = data.analyzers.filter((x) => x.status === "error").length;
  const verifiedTotal = data.analyzers.filter((x) => x.status === "verified").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Референс-центр лабораторной службы</div>
          <h1>Загрузка лабораторного оборудования</h1>
          <p>Единый реестр, верификация паспортной мощности и расчёт КПД по ЦКДЛ</p>
        </div>
        <div className="headerRight">
          <div className={`sourcePill source-${data.source}`}>
            <span className="sourceDot" />
            {data.source === "google-sheets" ? "Google Sheets · live" : "Fallback · требуется подключение"}
          </div>
          <div className="period">Август 2026</div>
        </div>
      </header>

      <section className="metrics">
        <article className="metric"><span>Общий КПД</span><strong>{pct(data.totalKpi)}</strong><small>{fmt(data.totalFact)} исследований</small></article>
        <article className="metric"><span>Мощность</span><strong>{fmt(data.totalCapacityPerHour)}</strong><small>ед./ч · {fmt(data.totalAnalyzersInCapacity)} приборов</small></article>
        <article className="metric warn"><span>Требуют уточнения</span><strong>{reviewTotal}</strong><small>жёлтые позиции</small></article>
        <article className={`metric ${errorTotal ? "danger" : ""}`}><span>Ошибки данных</span><strong>{errorTotal}</strong><small>{verifiedTotal} позиций проверено</small></article>
      </section>

      <section>
        <div className="sectionHead">
          <div><h2>ЦКДЛ</h2><p>Сводная загрузка и качество исходных данных</p></div>
        </div>
        <div className="labGrid">
          {data.laboratories.map((item) => (
            <button className={`labCard ${lab === item.name ? "labCardActive" : ""}`} key={item.name} onClick={() => setLab(lab === item.name ? "all" : item.name)}>
              <div className="labTitle">
                <h3>{item.name}</h3>
                <div className="labSignals">
                  {item.errorCount > 0 && <span className="dotError" title="Есть ошибки" />}
                  {item.reviewCount > 0 && <span className="dotWarn" title="Есть вопросы" />}
                </div>
              </div>
              <div className="kpiValue">{pct(item.kpi)}</div>
              <div className="bar"><span style={{ width: `${Math.min(item.kpi, 100)}%` }} /></div>
              <div className="cardMeta">
                <span>{fmt(item.capacityPerHour)} ед./ч</span>
                <span>{item.reviewCount ? `${item.reviewCount} на уточнение` : "без вопросов"}</span>
              </div>
              <div className="dataStatus">{item.dataStatus}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="registry">
        <div className="sectionHead">
          <div>
            <h2>Реестр оборудования</h2>
            <p>ЦКДЛ подтверждает фактическую конфигурацию; паспортная мощность определяется централизованно</p>
          </div>
          <div className="count">{filtered.length} позиций</div>
        </div>

        <div className="filters">
          <select value={lab} onChange={(e) => setLab(e.target.value)}>
            <option value="all">Все ЦКДЛ</option>
            {data.laboratories.map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="all">Все уровни</option>
            {levels.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="all">Все направления</option>
            {directions.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
            <option value="all">Все производители</option>
            {manufacturers.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as VerificationStatus | "all")}>
            {Object.entries(statusLabels).map(([key, value]) => <option value={key} key={key}>{value}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Модель, серийник, комментарий…" />
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ЦКДЛ</th>
                <th>Уровень</th>
                <th>Направление</th>
                <th>Анализатор</th>
                <th>Серийные номера</th>
                <th>Мощность</th>
                <th>Тех. статус</th>
                <th>Статус проверки</th>
                <th>Что уточнить</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className={item.status === "review" ? "rowReview" : item.status === "error" ? "rowError" : undefined}>
                  <td><strong>{item.laboratory}</strong></td>
                  <td>{item.level || "—"}</td>
                  <td>{item.direction || "—"}</td>
                  <td>
                    <strong>{item.manufacturer || "—"} {item.model}</strong>
                    {(item.sourceManufacturer || item.sourceModel) && (item.sourceManufacturer !== item.manufacturer || item.sourceModel !== item.model) && (
                      <div className="original">исходно: {item.sourceManufacturer} {item.sourceModel}</div>
                    )}
                  </td>
                  <td>{item.serials.length ? item.serials.join(", ") : "—"}</td>
                  <td>
                    {item.capacityPerHour ? fmt(item.capacityPerHour) : "—"}
                    {item.capacityPerHour && <span className="unit"> {item.capacityUnit === "samples/hour" ? "проб/ч" : "тест/ч"}</span>}
                  </td>
                  <td>{item.technicalStatus || "—"}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td className="issueCell">
                    {item.issue || "—"}
                    {item.sourceUrl && item.status !== "excluded" && <a href={item.sourceUrl} target="_blank" rel="noreferrer">источник мощности</a>}
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={9} className="empty">Нет позиций по выбранным фильтрам</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <span>Источник: {data.source === "google-sheets" ? "рабочая Google Таблица" : "контрольный набор данных"}</span>
        <span>Срез обновлён: {new Date(data.updatedAt).toLocaleString("ru-RU")}</span>
      </footer>
    </main>
  );
}
