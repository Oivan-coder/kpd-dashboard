"use client";

import { useEffect, useMemo, useState } from "react";
import type { Analyzer, DashboardData, VerificationStatus } from "@/lib/types";
import { StatusBadge } from "./status-badge";

type View = "overview" | "laboratories" | "equipment" | "catalog" | "issues" | "admin";
type EquipmentMode = "work" | "technical";
type SessionState = {
  authenticated: boolean;
  role: "admin" | "lab" | null;
  laboratory: string | null;
};

function fmt(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function pct(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + "%";
}

function groupKpi(rows: Analyzer[]) {
  const fact = rows.reduce((s, x) => s + (x.factInCalculation || 0), 0);
  const capacity = rows.reduce((s, x) => s + (x.monthlyCapacity || 0), 0);
  return {
    fact,
    capacity,
    kpi: capacity > 0 ? (fact / capacity) * 100 : null,
    count: rows.length,
    included: rows.filter((x) => x.includedInKpi).length,
    issues: rows.filter((x) => x.status === "review" || x.status === "error").length,
  };
}

function labelUnit(item: Analyzer) {
  return item.capacityUnit === "samples/hour" ? "проб/ч" : "тест/ч";
}

const statusLabels: Record<VerificationStatus | "all", string> = {
  all: "Все статусы",
  verified: "Проверено",
  review: "Требует уточнения",
  error: "Ошибка",
  excluded: "Не участвует в КПД",
};

export function Dashboard({ data }: { data: DashboardData }) {
  const [view, setView] = useState<View>("overview");
  const [lab, setLab] = useState("all");
  const [level, setLevel] = useState("all");
  const [address, setAddress] = useState("all");
  const [direction, setDirection] = useState("all");
  const [manufacturer, setManufacturer] = useState("all");
  const [status, setStatus] = useState<VerificationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [equipmentMode, setEquipmentMode] = useState<EquipmentMode>("work");

  const [session, setSession] = useState<SessionState>({ authenticated: false, role: null, laboratory: null });
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);

  const [answers, setAnswers] = useState<Record<string, { response: string; confirmedBy: string; busy: boolean; error: string }>>({});
  const [adminName, setAdminName] = useState("");
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<Analyzer | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");

  const [hourTarget, setHourTarget] = useState<Analyzer | null>(null);
  const [hourValue, setHourValue] = useState("210");
  const [hourReason, setHourReason] = useState("");
  const [hourAuthor, setHourAuthor] = useState("");
  const [hourBusy, setHourBusy] = useState(false);
  const [hourError, setHourError] = useState("");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setSession({
        authenticated: Boolean(s.authenticated),
        role: s.role ?? null,
        laboratory: s.laboratory ?? null,
      }))
      .catch(() => {});
  }, []);

  const login = async () => {
    setAccessBusy(true);
    setAccessError("");
    try {
      const r = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось войти");
      const next: SessionState = {
        authenticated: true,
        role: body.role,
        laboratory: body.laboratory ?? null,
      };
      setSession(next);
      setAccessCode("");
      if (next.role === "admin") setView("admin");
      if (next.role === "lab" && next.laboratory) {
        setLab(next.laboratory);
        setView("issues");
      }
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setAccessBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setSession({ authenticated: false, role: null, laboratory: null });
    setLab("all");
    setView("overview");
  };

  const reviewRows = useMemo(
    () => data.analyzers.filter((x) => x.status === "review" || x.status === "error"),
    [data.analyzers]
  );

  const levels = useMemo(
    () => [...new Set(data.analyzers.map((x) => x.level).filter(Boolean))].sort(),
    [data.analyzers]
  );
  const directions = useMemo(
    () => [...new Set(data.analyzers.map((x) => x.direction).filter(Boolean))].sort(),
    [data.analyzers]
  );
  const manufacturers = useMemo(
    () => [...new Set(data.analyzers.map((x) => x.manufacturer).filter(Boolean))].sort(),
    [data.analyzers]
  );
  const addresses = useMemo(
    () => [...new Set(data.analyzers.filter((x) => lab === "all" || x.laboratory === lab).map((x) => x.address).filter(Boolean))].sort(),
    [data.analyzers, lab]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.analyzers.filter((x) => {
      if (lab !== "all" && x.laboratory !== lab) return false;
      if (level !== "all" && x.level !== level) return false;
      if (address !== "all" && x.address !== address) return false;
      if (direction !== "all" && x.direction !== direction) return false;
      if (manufacturer !== "all" && x.manufacturer !== manufacturer) return false;
      if (status !== "all" && x.status !== status) return false;
      if (
        q &&
        ![
          x.laboratory, x.organization, x.address, x.level, x.direction, x.manufacturer, x.model,
          x.inventoryNumber, x.serials.join(" "), x.balanceType, x.balanceHolderDetails,
          x.bregisConnection, x.technicalStatus, x.responsiblePerson, x.note, x.issue ?? "",
          x.question ?? "", x.labComment ?? "",
        ].join(" ").toLowerCase().includes(q)
      ) return false;
      return true;
    });
  }, [data.analyzers, lab, level, address, direction, manufacturer, status, search]);

  const labDetails = useMemo(() => {
    return data.laboratories.map((l) => {
      const rows = data.analyzers.filter((x) => x.laboratory === l.name);
      const labAddresses = [...new Set(rows.map((x) => x.address).filter(Boolean))];
      const levelBreakdown = [...new Set(rows.map((x) => x.level).filter(Boolean))].map((name) => ({
        name,
        ...groupKpi(rows.filter((x) => x.level === name)),
      }));
      return { ...l, rows, addresses: labAddresses, levelBreakdown };
    });
  }, [data]);

  const catalog = useMemo(() => {
    const groups = new Map<string, {
      manufacturer: string;
      model: string;
      direction: string;
      capacity: number | null;
      unit: string;
      sourceUrl?: string;
      instances: number;
      labs: Set<string>;
      verified: number;
      review: number;
    }>();

    for (const x of data.analyzers) {
      const mfr = x.sourceManufacturer || x.manufacturer || "Не указан";
      const model = x.sourceModel || x.model || "Не указана";
      const capacity = x.capacityPerHour;
      const unit = x.capacityUnit === "samples/hour" ? "проб/ч" : "тест/ч";
      const key = [mfr, model, capacity ?? "", unit].join("|");
      const current = groups.get(key) ?? {
        manufacturer: mfr,
        model,
        direction: x.direction,
        capacity,
        unit,
        sourceUrl: x.sourceUrl,
        instances: 0,
        labs: new Set<string>(),
        verified: 0,
        review: 0,
      };
      current.instances += 1;
      current.labs.add(x.laboratory);
      if (x.status === "verified") current.verified += 1;
      if (x.status === "review" || x.status === "error") current.review += 1;
      if (!current.sourceUrl && x.sourceUrl) current.sourceUrl = x.sourceUrl;
      groups.set(key, current);
    }

    return [...groups.values()].sort((a, b) =>
      a.manufacturer.localeCompare(b.manufacturer, "ru") || a.model.localeCompare(b.model, "ru")
    );
  }, [data.analyzers]);

  const catalogFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((x) =>
      !q || [x.manufacturer, x.model, x.direction, String(x.capacity ?? "")].join(" ").toLowerCase().includes(q)
    );
  }, [catalog, search]);

  const levelStructure = useMemo(() => {
    const map = new Map<string, number>();
    data.analyzers.forEach((x) => map.set(x.level || "Не указан", (map.get(x.level || "Не указан") || 0) + 1));
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [data.analyzers]);

  const issuesByLab = useMemo(() => data.laboratories.map((x) => ({
    name: x.name,
    open: reviewRows.filter((r) => r.laboratory === x.name && !r.response).length,
    answered: reviewRows.filter((r) => r.laboratory === x.name && Boolean(r.response)).length,
  })), [data.laboratories, reviewRows]);

  const pendingHourRequests = useMemo(
    () => data.analyzers.filter((x) => x.proposedHours && x.hoursStatus === "На согласовании"),
    [data.analyzers]
  );

  const incomingResponses = useMemo(
    () => data.analyzers.filter((x) => Boolean(x.response)).sort((a, b) => {
      const aPending = a.responseStatus === "Получен ответ" ? 0 : 1;
      const bPending = b.responseStatus === "Получен ответ" ? 0 : 1;
      return aPending - bPending;
    }),
    [data.analyzers]
  );

  const openLab = (name: string) => {
    setLab(name);
    setAddress("all");
    setLevel("all");
    setDirection("all");
    setManufacturer("all");
    setStatus("all");
    setSearch("");
    setView("laboratories");
  };

  const resetFilters = () => {
    setAddress("all");
    setLevel("all");
    setDirection("all");
    setManufacturer("all");
    setStatus("all");
    setSearch("");
  };

  const goOverview = () => {
    setView("overview");
    setLab("all");
    resetFilters();
  };

  const goBack = () => {
    if (view === "equipment") {
      if (address !== "all") { setAddress("all"); setView("laboratories"); return; }
      if (lab !== "all") { setView("laboratories"); return; }
      setView("overview");
      return;
    }
    if (view === "laboratories") {
      if (lab !== "all") { setLab("all"); return; }
      setView("overview");
      return;
    }
    if (view === "catalog" || view === "issues" || view === "admin") setView("overview");
  };

  const submitAnswer = async (item: Analyzer) => {
    const form = answers[item.id] ?? { response: "", confirmedBy: "", busy: false, error: "" };
    setAnswers((p) => ({ ...p, [item.id]: { ...form, busy: true, error: "" } }));
    try {
      const r = await fetch("/api/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, response: form.response, confirmedBy: form.confirmedBy }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      setAnswers((p) => ({
        ...p,
        [item.id]: { ...form, busy: false, error: e instanceof Error ? e.message : "Ошибка сохранения" },
      }));
    }
  };

  const openComment = (item: Analyzer) => {
    setCommentTarget(item);
    setCommentText(item.labComment || "");
    setCommentAuthor(item.labCommentAuthor || "");
    setCommentError("");
  };

  const submitComment = async () => {
    if (!commentTarget) return;
    setCommentBusy(true);
    setCommentError("");
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: commentTarget.id, comment: commentText, author: commentAuthor }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Ошибка сохранения");
      setCommentBusy(false);
    }
  };

  const openHours = (item: Analyzer) => {
    setHourTarget(item);
    setHourValue(String(item.proposedHours || item.approvedHours || item.defaultHours || 210));
    setHourReason(item.hoursReason || "");
    setHourAuthor("");
    setHourError("");
  };

  const submitHours = async () => {
    if (!hourTarget) return;
    setHourBusy(true);
    setHourError("");
    try {
      const r = await fetch("/api/hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: hourTarget.id,
          hours: Number(hourValue),
          reason: hourReason,
          author: hourAuthor,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      setHourError(e instanceof Error ? e.message : "Ошибка сохранения");
      setHourBusy(false);
    }
  };

  const reviewHours = async (item: Analyzer, approved: boolean) => {
    setAdminBusy(item.id + (approved ? "hours-approve" : "hours-reject"));
    try {
      const r = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, kind: "hours", approved, adminName }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
      setAdminBusy(null);
    }
  };

  const reviewResponse = async (item: Analyzer, nextStatus: "Принято" | "На доработку") => {
    setAdminBusy(item.id + nextStatus);
    try {
      const r = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, status: nextStatus, adminName }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка");
      setAdminBusy(null);
    }
  };

  const reviewTotal = reviewRows.length;
  const verifiedTotal = data.analyzers.filter((x) => x.status === "verified").length;
  const excludedTotal = data.analyzers.filter((x) => x.status === "excluded").length;
  const includedTotal = data.analyzers.filter((x) => x.includedInKpi).length;
  const canComment = (item: Analyzer) =>
    session.role === "admin" || (session.role === "lab" && session.laboratory === item.laboratory);
  const canEditHours = canComment;

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div className="brand">
          <div className="brandMark">РЦ</div>
          <div><strong>КПД оборудования</strong><span>Лабораторная служба МО</span></div>
        </div>

        <nav>
          <button className={view === "overview" ? "active" : ""} onClick={goOverview}>Обзор</button>
          <button className={view === "laboratories" ? "active" : ""} onClick={() => { setLab("all"); setView("laboratories"); }}>ЦКДЛ</button>
          <button className={view === "equipment" ? "active" : ""} onClick={() => { setLab("all"); resetFilters(); setView("equipment"); }}>Оборудование</button>
          <button className={view === "catalog" ? "active" : ""} onClick={() => { setSearch(""); setView("catalog"); }}>Справочник анализаторов</button>
          <button className={view === "issues" ? "active" : ""} onClick={() => setView("issues")}>
            Уточнения <span className="navCount">{reviewTotal}</span>
          </button>
          <button className={view === "admin" ? "active adminNav" : "adminNav"} onClick={() => setView("admin")}>
            Админ <span className="navCount neutral">{incomingResponses.filter((x) => x.responseStatus === "Получен ответ").length + pendingHourRequests.length}</span>
          </button>
        </nav>

        <div className="sessionBox">
          {session.authenticated ? (
            <>
              <span>{session.role === "admin" ? "Администратор РЦ" : "ЦКДЛ"}</span>
              <strong>{session.role === "admin" ? "Полный доступ" : session.laboratory}</strong>
              <button onClick={logout}>Выйти</button>
            </>
          ) : (
            <>
              <span>Рабочий вход</span>
              <input value={accessCode} onChange={(e) => setAccessCode(e.target.value.toUpperCase())} placeholder="Код доступа" />
              <button onClick={login} disabled={accessBusy || !accessCode.trim()}>{accessBusy ? "Проверяем…" : "Войти"}</button>
              {accessError && <small>{accessError}</small>}
            </>
          )}
        </div>

        <div className="sideMeta">
          <div className={`sourcePill source-${data.source}`}><span className="sourceDot" />{data.source === "google-sheets" ? "Google Sheets · live" : "Fallback"}</div>
          <span>Август 2026</span>
        </div>
      </aside>

      <section className="workspace">
        {view !== "overview" && (
          <div className="navTrail">
            <button className="backButton" onClick={goBack}>← Назад</button>
            <div className="breadcrumbs">
              <button onClick={goOverview}>Обзор</button>
              <span>›</span>
              <strong>{view === "laboratories" ? "ЦКДЛ" : view === "equipment" ? "Оборудование" : view === "catalog" ? "Справочник" : view === "issues" ? "Уточнения" : "Админ"}</strong>
              {lab !== "all" && <><span>›</span><strong>{lab}</strong></>}
              {address !== "all" && <><span>›</span><strong>{address}</strong></>}
            </div>
          </div>
        )}

        <header className="pageHeader">
          <div>
            <div className="eyebrow">Референс-центр лабораторной службы</div>
            <h1>
              {view === "overview" && "Панель управления лабораторным парком"}
              {view === "laboratories" && (lab === "all" ? "ЦКДЛ" : lab)}
              {view === "equipment" && "Реестр оборудования"}
              {view === "catalog" && "Справочник анализаторов"}
              {view === "issues" && "Уточнения ЦКДЛ"}
              {view === "admin" && "Администрирование уточнений"}
            </h1>
            <p>
              {view === "overview" && "Загрузка, мощности, парк оборудования и качество исходных данных"}
              {view === "laboratories" && "Кусты, адреса, уровни и детализация загрузки"}
              {view === "equipment" && "Полный рабочий и технический перечень оборудования"}
              {view === "catalog" && "Нормализованный перечень моделей и паспортной производительности без привязки к ЦКДЛ"}
              {view === "issues" && "Конкретные вопросы, на которые должны ответить заведующие ЦКДЛ"}
              {view === "admin" && "Входящие ответы ЦКДЛ, проверка и возврат на доработку"}
            </p>
          </div>
        </header>

        {view === "overview" && (
          <>
            <section className="metrics">
              <article className="metric primaryMetric"><span>Общий КПД</span><strong>{pct(data.totalKpi)}</strong><small>{fmt(data.totalFact)} исследований за август</small></article>
              <article className="metric"><span>Парк оборудования</span><strong>{fmt(data.analyzers.length)}</strong><small>{includedTotal} участвуют в расчёте КПД</small></article>
              <article className="metric"><span>Паспортная мощность</span><strong>{fmt(data.totalCapacityPerHour)}</strong><small>ед./ч · {data.totalAnalyzersInCapacity} приборов</small></article>
              <article className="metric warn"><span>Требуют уточнения</span><strong>{reviewTotal}</strong><small>{verifiedTotal} позиций верифицировано</small></article>
            </section>

            <section className="methodologyPanel">
              <div className="methodologyMain">
                <span className="methodologyEyebrow">Методика расчёта</span>
                <h2>Как считается КПД оборудования</h2>
                <div className="formulaBox">
                  <strong>КПД = фактический объём / расчётная мощность × 100%</strong>
                  <span>Расчётная мощность = паспортная производительность прибора × расчётные часы работы за месяц</span>
                </div>
              </div>
              <div className="methodologyFacts">
                <div><span>Базовое время</span><strong>210 ч/мес</strong><small>используется по умолчанию для каждого включённого прибора</small></div>
                <div><span>Если режим другой</span><strong>ЦКДЛ предлагает часы</strong><small>с указанием причины; в расчёт они попадут после подтверждения РЦ</small></div>
                <div><span>В знаменатель</span><strong>2–3 уровень / ЦКДЛ</strong><small>только оборудование, включённое в контур расчёта и имеющее принятую паспортную мощность</small></div>
                <div><span>Исключаются</span><strong>неработающее и вне методики</strong><small>1 уровень/экспресс, ПЦР, ИФА, СОЭ, HbA1c и другие согласованные исключения</small></div>
              </div>
            </section>

            <div className="analyticsGrid two">
              <section className="panel chartPanel">
                <div className="panelHead"><div><h2>КПД по ЦКДЛ</h2><p>Отвечает на вопрос: какой куст использует большую долю своей расчётной мощности</p></div></div>
                <KpiBars items={data.laboratories.map((x) => ({ name: x.name, value: x.kpi }))} onSelect={openLab} />
              </section>

              <section className="panel chartPanel">
                <div className="panelHead"><div><h2>Факт vs расчётная мощность</h2><p>Серый фон — потенциальный объём за месяц, синяя полоса — фактически выполненный объём</p></div></div>
                <FactCapacityChart items={data.laboratories.map((x) => ({ name: x.name, fact: x.fact, capacity: x.monthlyCapacity }))} />
              </section>
            </div>

            <div className="analyticsGrid two">
              <section className="panel chartPanel">
                <div className="panelHead"><div><h2>Структура парка по уровням</h2><p>Показывает, где физически сосредоточено оборудование и какая часть парка относится к целевому контуру</p></div></div>
                <DonutBreakdown items={levelStructure} total={data.analyzers.length} />
              </section>

              <section className="panel chartPanel">
                <div className="panelHead"><div><h2>Карта уточнений</h2><p>Показывает, в каких ЦКДЛ остаются вопросы по модели, конфигурации, мощности или статусу оборудования</p></div></div>
                <IssueMap items={issuesByLab} />
              </section>
            </div>

            <section className="panel">
              <div className="panelHead">
                <div><h2>ЦКДЛ</h2><p>Сводные показатели и быстрый переход к детализации</p></div>
                <button className="textButton" onClick={() => { setLab("all"); setView("laboratories"); }}>Открыть все →</button>
              </div>
              <div className="labGrid">
                {labDetails.map((item) => (
                  <button className="labCard" key={item.name} onClick={() => openLab(item.name)}>
                    <div className="labTitle"><h3>{item.name}</h3>{item.reviewCount > 0 && <span className="dotWarn" />}</div>
                    <div className="kpiValue">{pct(item.kpi)}</div>
                    <div className="bar"><span style={{ width: `${Math.min(item.kpi, 100)}%` }} /></div>
                    <div className="cardMeta"><span>{item.addresses.length} адресов</span><span>{item.rows.length} позиций</span></div>
                    <div className="cardMeta"><span>{item.analyzers} в расчёте</span><span>{item.reviewCount} вопросов</span></div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {view === "laboratories" && (
          <>
            {lab === "all" ? (
              <>
                <section className="panel">
                  <div className="panelHead"><div><h2>Свод по 8 ЦКДЛ</h2><p>Выберите куст для детализации по адресам и уровням</p></div></div>
                  <div className="labGrid">
                    {labDetails.map((item) => (
                      <button className="labCard" key={item.name} onClick={() => openLab(item.name)}>
                        <div className="labTitle"><h3>{item.name}</h3>{item.reviewCount > 0 && <span className="dotWarn" />}</div>
                        <div className="kpiValue">{pct(item.kpi)}</div>
                        <div className="bar"><span style={{ width: `${Math.min(item.kpi, 100)}%` }} /></div>
                        <div className="cardMeta"><span>{item.addresses.length} адресов</span><span>{item.rows.length} позиций</span></div>
                        <div className="cardMeta"><span>{item.analyzers} в расчёте</span><span>{item.reviewCount} уточнений</span></div>
                        <div className="dataStatus">Открыть ЦКДЛ →</div>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panelHead"><div><h2>Сравнительная таблица</h2><p>Ключевые показатели в одном месте</p></div></div>
                  <div className="simpleCompare">
                    <div className="compareHead"><span>ЦКДЛ</span><span>КПД</span><span>Факт</span><span>Мощность/ч</span><span>В расчёте</span><span>Уточнений</span></div>
                    {labDetails.map((x) => (
                      <button key={x.name} className="compareRow" onClick={() => openLab(x.name)}>
                        <strong>{x.name}</strong><span>{pct(x.kpi)}</span><span>{fmt(x.fact)}</span><span>{fmt(x.capacityPerHour)}</span><span>{x.analyzers}</span><span>{x.reviewCount}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              labDetails.filter((x) => x.name === lab).map((item) => (
                <div key={item.name}>
                  <section className="metrics labMetrics">
                    <article className="metric primaryMetric"><span>КПД ЦКДЛ</span><strong>{pct(item.kpi)}</strong><small>{fmt(item.fact)} исследований</small></article>
                    <article className="metric"><span>Адресов</span><strong>{item.addresses.length}</strong><small>{item.rows.length} единиц оборудования</small></article>
                    <article className="metric"><span>В расчёте мощности</span><strong>{item.analyzers}</strong><small>{fmt(item.capacityPerHour)} ед./ч</small></article>
                    <article className="metric warn"><span>Уточнений</span><strong>{item.reviewCount}</strong><small>требуют проверки исходных данных</small></article>
                  </section>

                  <div className="analyticsGrid two">
                    <section className="panel">
                      <div className="panelHead"><div><h2>КПД по уровням</h2><p>Внутри выбранной ЦКДЛ</p></div></div>
                      <KpiBars items={item.levelBreakdown.map((x) => ({ name: x.name, value: x.kpi ?? 0 }))} />
                    </section>
                    <section className="panel">
                      <div className="panelHead"><div><h2>Структура оборудования</h2><p>Количество позиций по уровням</p></div></div>
                      <DonutBreakdown items={item.levelBreakdown.map((x) => ({ name: x.name, count: x.count }))} total={item.rows.length} />
                    </section>
                  </div>

                  <section className="panel">
                    <div className="panelHead"><div><h2>Адреса</h2><p>Нажмите на адрес, чтобы открыть оборудование</p></div></div>
                    <div className="addressList">
                      {item.addresses.map((addr) => {
                        const rows = item.rows.filter((x) => x.address === addr);
                        const g = groupKpi(rows);
                        return (
                          <button key={addr} className="addressRow" onClick={() => { setAddress(addr); setView("equipment"); }}>
                            <div><strong>{addr}</strong><span>{rows.length} единиц оборудования</span></div>
                            <div><span>КПД адреса</span><strong>{pct(g.kpi)}</strong></div>
                            <div><span>В расчёте</span><strong>{g.included}</strong></div>
                            <div><span>Уточнений</span><strong>{g.issues}</strong></div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              ))
            )}
          </>
        )}

        {view === "equipment" && (
          <section className="panel">
            <div className="panelHead registryHead">
              <div>
                <h2>{equipmentMode === "work" ? "Полный перечень оборудования" : "Технический реестр оборудования"}</h2>
                <p>{equipmentMode === "work" ? "Загрузка, мощность, КПД, техсостояние и комментарии" : "Полные технические и учётные сведения по каждой позиции"}</p>
              </div>
              <div className="registryHeadRight">
                <div className="registrySwitch">
                  <button className={equipmentMode === "work" ? "active" : ""} onClick={() => setEquipmentMode("work")}>Рабочий вид</button>
                  <button className={equipmentMode === "technical" ? "active" : ""} onClick={() => setEquipmentMode("technical")}>Технический реестр</button>
                </div>
                <div className="count">{filtered.length} из {data.analyzers.length}</div>
              </div>
            </div>

            <Filters lab={lab} setLab={setLab} level={level} setLevel={setLevel} address={address} setAddress={setAddress}
              direction={direction} setDirection={setDirection} manufacturer={manufacturer} setManufacturer={setManufacturer}
              status={status} setStatus={setStatus} search={search} setSearch={setSearch} levels={levels}
              directions={directions} manufacturers={manufacturers} addresses={addresses}
              labs={data.laboratories.map((x) => x.name)} />

            {equipmentMode === "work"
              ? <EquipmentTable rows={filtered} canComment={canComment} openComment={openComment} canEditHours={canEditHours} openHours={openHours} />
              : <TechnicalEquipmentTable rows={filtered} canComment={canComment} openComment={openComment} canEditHours={canEditHours} openHours={openHours} />}
          </section>
        )}

        {view === "catalog" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Нормализованный справочник моделей</h2><p>Без привязки к конкретной ЦКДЛ: паспортная мощность, источник и распространённость</p></div>
              <div className="count">{catalogFiltered.length} моделей/конфигураций</div>
            </div>
            <div className="catalogSearch">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Производитель, модель, направление…" />
            </div>
            <div className="catalogGrid">
              {catalogFiltered.map((x) => (
                <article className="catalogCard" key={[x.manufacturer, x.model, x.capacity, x.unit].join("|")}>
                  <div className="catalogTop"><span>{x.manufacturer}</span><strong>{x.instances} шт.</strong></div>
                  <h3>{x.model}</h3>
                  <p>{x.direction || "Направление не указано"}</p>
                  <div className="passportValue"><span>Паспортная мощность</span><strong>{x.capacity ? `${fmt(x.capacity)} ${x.unit}` : "Требует уточнения"}</strong></div>
                  <div className="catalogMeta"><span>{x.labs.size} ЦКДЛ</span><span>{x.verified} проверено</span><span>{x.review} вопросов</span></div>
                  {x.sourceUrl && <a href={x.sourceUrl} target="_blank" rel="noreferrer">Открыть паспортный источник →</a>}
                </article>
              ))}
            </div>
          </section>
        )}

        {view === "issues" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Что нужно уточнить</h2><p>Каждый вопрос привязан к конкретному прибору и строке рабочего реестра</p></div>
              <div className="count">{session.role === "lab" ? reviewRows.filter((x) => x.laboratory === session.laboratory).length : reviewRows.length} позиций</div>
            </div>

            {!session.authenticated && <LoginHero title="Войти как заведующий ЦКДЛ" text="Введите код своей ЦКДЛ. После входа откроются только вопросы вашего куста и формы ответа." code={accessCode} setCode={setAccessCode} busy={accessBusy} error={accessError} login={login} />}
            {session.role === "admin" && <div className="infoBanner">Вы вошли как администратор. Для обработки ответов используйте вкладку «Админ».</div>}
            {session.role === "lab" && <div className="infoBanner successBanner">Режим ЦКДЛ: <strong>{session.laboratory}</strong>. Можно отвечать только по своему кусту.</div>}

            <div className="issuesWorkspace">
              {reviewRows
                .filter((x) => session.role !== "lab" || x.laboratory === session.laboratory)
                .map((x) => {
                  const form = answers[x.id] ?? { response: "", confirmedBy: "", busy: false, error: "" };
                  const editable = session.role === "lab" && session.laboratory === x.laboratory;
                  return (
                    <article className="issueDetailCard" key={x.id}>
                      <div className="issueDetailHead">
                        <div><div className="issueBreadcrumb">{x.laboratory} · {x.level}</div><h3>{x.manufacturer} {x.model}</h3></div>
                        <StatusBadge status={x.status} />
                      </div>
                      <div className="issueFacts">
                        <div><span>Адрес</span><strong>{x.address || "не указан"}</strong></div>
                        <div><span>Серийный номер</span><strong>{x.serials.join(", ") || "не указан"}</strong></div>
                        <div><span>Принятая мощность</span><strong>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</strong></div>
                        <div><span>Тех. статус</span><strong>{x.technicalStatus || "—"}</strong></div>
                      </div>
                      <div className="questionBox"><span>Что нужно уточнить</span><strong>{x.question}</strong></div>

                      {x.response ? (
                        <div className="submittedAnswer">
                          <span>Ответ ЦКДЛ · {x.responseStatus || "Получен"}</span>
                          <p>{x.response}</p>
                          <small>{x.confirmedBy}{x.confirmedAt ? ` · ${x.confirmedAt}` : ""}</small>
                        </div>
                      ) : editable ? (
                        <div className="answerForm">
                          <label><span>Ответ / уточняющая информация</span><textarea rows={4} value={form.response} onChange={(e) => setAnswers((p) => ({ ...p, [x.id]: { ...form, response: e.target.value } }))} placeholder="Например: 2 аналитических модуля XN-10 + SP-10…" /></label>
                          <label><span>ФИО и должность подтверждающего</span><input value={form.confirmedBy} onChange={(e) => setAnswers((p) => ({ ...p, [x.id]: { ...form, confirmedBy: e.target.value } }))} placeholder="Иванова И.И., заведующий КДЛ" /></label>
                          {form.error && <div className="formError">{form.error}</div>}
                          <button className="submitAnswer" onClick={() => submitAnswer(x)} disabled={form.busy || !form.response.trim() || !form.confirmedBy.trim()}>{form.busy ? "Сохраняем…" : "Отправить уточнение"}</button>
                        </div>
                      ) : (
                        <div className="answerRoute"><p>Для ответа требуется вход под кодом {x.laboratory}.</p></div>
                      )}
                    </article>
                  );
                })}
            </div>
          </section>
        )}

        {view === "admin" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Входящие уточнения</h2><p>Ответы заведующих ЦКДЛ и их статус обработки</p></div>
              <div className="count">{incomingResponses.filter((x) => x.responseStatus === "Получен ответ").length + pendingHourRequests.length} новых</div>
            </div>

            {session.role !== "admin" ? (
              <LoginHero title="Вход администратора РЦ" text="Админ-раздел доступен только по отдельному коду. Здесь собираются ответы всех ЦКДЛ." code={accessCode} setCode={setAccessCode} busy={accessBusy} error={accessError} login={login} />
            ) : (
              <>
                <div className="adminToolbar">
                  <label><span>ФИО администратора для журнала</span><input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Иванов И.И." /></label>
                  <div className="adminStats"><div><strong>{incomingResponses.length}</strong><span>всего ответов</span></div><div><strong>{incomingResponses.filter((x) => x.responseStatus === "Получен ответ").length}</strong><span>на проверке</span></div><div><strong>{incomingResponses.filter((x) => x.responseStatus === "Принято").length}</strong><span>принято</span></div></div>
                </div>

                <div className="adminQueue">
                  {incomingResponses.map((x) => (
                    <article className="adminCard" key={x.id}>
                      <div className="adminCardHead">
                        <div><span>{x.laboratory} · {x.level}</span><h3>{x.manufacturer} {x.model}</h3><small>{x.address}</small></div>
                        <span className={`responseState ${x.responseStatus === "Принято" ? "accepted" : x.responseStatus === "На доработку" ? "revision" : "new"}`}>{x.responseStatus || "Получен ответ"}</span>
                      </div>
                      <div className="adminQuestion"><span>Наш вопрос</span><p>{x.question}</p></div>
                      <div className="adminResponse"><span>Ответ ЦКДЛ</span><p>{x.response}</p><small>{x.confirmedBy}{x.confirmedAt ? ` · ${x.confirmedAt}` : ""}</small></div>
                      {x.labComment && <div className="adminComment"><span>Комментарий к прибору</span><p>{x.labComment}</p><small>{x.labCommentAuthor}{x.labCommentAt ? ` · ${x.labCommentAt}` : ""}</small></div>}
                      <div className="adminActions">
                        <button className="acceptBtn" onClick={() => reviewResponse(x, "Принято")} disabled={!adminName.trim() || Boolean(adminBusy)}>{adminBusy === x.id + "Принято" ? "Сохраняем…" : "Принять"}</button>
                        <button className="revisionBtn" onClick={() => reviewResponse(x, "На доработку")} disabled={!adminName.trim() || Boolean(adminBusy)}>{adminBusy === x.id + "На доработку" ? "Сохраняем…" : "Вернуть на доработку"}</button>
                      </div>
                    </article>
                  ))}
                  {!incomingResponses.length && <div className="emptyState">Ответов от ЦКДЛ пока нет.</div>}
                </div>

                <div className="adminSectionTitle">
                  <div><h2>Изменение расчётных часов</h2><p>Предложения ЦКДЛ, которые меняют знаменатель и итоговый КПД</p></div>
                  <span>{pendingHourRequests.length} на согласовании</span>
                </div>
                <div className="adminQueue">
                  {pendingHourRequests.map((x) => (
                    <article className="adminCard hourRequestCard" key={x.id}>
                      <div className="adminCardHead">
                        <div><span>{x.laboratory} · {x.level}</span><h3>{x.manufacturer} {x.model}</h3><small>{x.address}</small></div>
                        <span className="responseState new">На согласовании</span>
                      </div>
                      <div className="hourCompare">
                        <div><span>Сейчас в расчёте</span><strong>{x.effectiveHours} ч/мес</strong></div>
                        <div><span>Предложено ЦКДЛ</span><strong>{x.proposedHours} ч/мес</strong></div>
                      </div>
                      <div className="adminQuestion"><span>Причина</span><p>{x.hoursReason || "Не указана"}</p></div>
                      <div className="adminActions">
                        <button className="acceptBtn" onClick={() => reviewHours(x, true)} disabled={!adminName.trim() || Boolean(adminBusy)}>{adminBusy === x.id + "hours-approve" ? "Сохраняем…" : "Утвердить часы"}</button>
                        <button className="revisionBtn" onClick={() => reviewHours(x, false)} disabled={!adminName.trim() || Boolean(adminBusy)}>{adminBusy === x.id + "hours-reject" ? "Сохраняем…" : "Отклонить"}</button>
                      </div>
                    </article>
                  ))}
                  {!pendingHourRequests.length && <div className="emptyState">Новых предложений по расчётным часам нет.</div>}
                </div>
              </>
            )}
          </section>
        )}

        <footer><span>Источник: рабочая Google Таблица</span><span>Обновлено: {new Date(data.updatedAt).toLocaleString("ru-RU")}</span></footer>
      </section>

      {hourTarget && (
        <div className="modalBackdrop" onMouseDown={() => setHourTarget(null)}>
          <div className="commentModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead"><div><span>{hourTarget.laboratory}</span><h3>Расчётные часы · {hourTarget.manufacturer} {hourTarget.model}</h3></div><button onClick={() => setHourTarget(null)}>×</button></div>
            <p>{hourTarget.address}</p>
            <div className="hourCurrent"><span>Текущее значение в расчёте</span><strong>{hourTarget.effectiveHours} ч/мес</strong><small>{hourTarget.approvedHours ? "утверждено РЦ" : "базовое значение методики"}</small></div>
            <label><span>Предлагаемые часы в месяц</span><input type="number" min="1" max="744" value={hourValue} onChange={(e) => setHourValue(e.target.value)} /></label>
            <label><span>Почему режим отличается от 210 часов</span><textarea rows={4} value={hourReason} onChange={(e) => setHourReason(e.target.value)} placeholder="Например: прибор работает круглосуточно 7 дней в неделю / только 2 смены / ограниченный график…" /></label>
            <label><span>ФИО и должность</span><input value={hourAuthor} onChange={(e) => setHourAuthor(e.target.value)} placeholder="Иванова И.И., заведующий КДЛ" /></label>
            {hourError && <div className="formError">{hourError}</div>}
            <div className="modalActions"><button onClick={() => setHourTarget(null)}>Отмена</button><button className="saveCommentBtn" onClick={submitHours} disabled={hourBusy || !hourValue || !hourReason.trim() || !hourAuthor.trim()}>{hourBusy ? "Отправляем…" : "Отправить на согласование"}</button></div>
          </div>
        </div>
      )}

      {commentTarget && (
        <div className="modalBackdrop" onMouseDown={() => setCommentTarget(null)}>
          <div className="commentModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHead"><div><span>{commentTarget.laboratory}</span><h3>{commentTarget.manufacturer} {commentTarget.model}</h3></div><button onClick={() => setCommentTarget(null)}>×</button></div>
            <p>{commentTarget.address}</p>
            <label><span>Комментарий по прибору</span><textarea rows={5} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Что необходимо зафиксировать по этой позиции?" /></label>
            <label><span>Автор</span><input value={commentAuthor} onChange={(e) => setCommentAuthor(e.target.value)} placeholder="ФИО, должность" /></label>
            {commentError && <div className="formError">{commentError}</div>}
            <div className="modalActions"><button onClick={() => setCommentTarget(null)}>Отмена</button><button className="saveCommentBtn" onClick={submitComment} disabled={commentBusy || !commentText.trim() || !commentAuthor.trim()}>{commentBusy ? "Сохраняем…" : "Сохранить комментарий"}</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

function LoginHero(props: {
  title: string;
  text: string;
  code: string;
  setCode: (value: string) => void;
  busy: boolean;
  error: string;
  login: () => void;
}) {
  return (
    <div className="loginHero">
      <div><span>Защищённый режим</span><h3>{props.title}</h3><p>{props.text}</p></div>
      <div className="loginHeroForm">
        <input value={props.code} onChange={(e) => props.setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && props.login()} placeholder="Код доступа" />
        <button onClick={props.login} disabled={props.busy || !props.code.trim()}>{props.busy ? "Проверяем…" : "Войти"}</button>
        {props.error && <small>{props.error}</small>}
      </div>
    </div>
  );
}

function KpiBars({ items, onSelect }: { items: { name: string; value: number }[]; onSelect?: (name: string) => void }) {
  return (
    <div className="kpiBars">
      {items.map((x) => (
        <button key={x.name} onClick={() => onSelect?.(x.name)} className={onSelect ? "clickableBar" : ""}>
          <span>{x.name}</span>
          <div><i style={{ width: `${Math.min(x.value, 100)}%` }} /></div>
          <strong>{pct(x.value)}</strong>
        </button>
      ))}
    </div>
  );
}

function FactCapacityChart({ items }: { items: { name: string; fact: number; capacity: number }[] }) {
  const max = Math.max(1, ...items.map((x) => x.capacity));
  return (
    <div className="factChart">
      {items.map((x) => (
        <div className="factRow" key={x.name}>
          <strong>{x.name}</strong>
          <div className="dualBar"><i className="capacityBar" style={{ width: `${x.capacity / max * 100}%` }} /><i className="factBar" style={{ width: `${x.fact / max * 100}%` }} /></div>
          <span>{x.capacity ? pct(x.fact / x.capacity * 100) : "—"}</span>
        </div>
      ))}
      <div className="chartLegendInline"><span><i className="factKey" />Факт</span><span><i className="capacityKey" />Мощность</span></div>
    </div>
  );
}

function DonutBreakdown({ items, total }: { items: { name: string; count: number }[]; total: number }) {
  let cursor = 0;
  const colors = ["#315f91", "#5f85ad", "#8ca7c2", "#b7c8d8", "#d9e2ea", "#8a97a5"];
  const segments = items.map((x, i) => {
    const start = total ? cursor / total * 100 : 0;
    cursor += x.count;
    return { ...x, start, end: total ? cursor / total * 100 : 0, color: colors[i % colors.length] };
  });
  const gradient = segments.map((x) => `${x.color} ${x.start}% ${x.end}%`).join(", ");
  return (
    <div className="donutWrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient || "#edf1f5 0 100%"})` }}><div><strong>{fmt(total)}</strong><span>позиций</span></div></div>
      <div className="donutLegend">{segments.map((x) => <div key={x.name}><i style={{ background: x.color }} /><span>{x.name}</span><strong>{x.count}</strong><small>{total ? pct(x.count / total * 100) : "—"}</small></div>)}</div>
    </div>
  );
}

function IssueMap({ items }: { items: { name: string; open: number; answered: number }[] }) {
  const max = Math.max(1, ...items.map((x) => x.open + x.answered));
  return (
    <div className="issueMap">
      {items.map((x) => (
        <div key={x.name}><strong>{x.name}</strong><div className="issueTrack"><i className="answeredIssues" style={{ width: `${x.answered / max * 100}%` }} /><i className="openIssues" style={{ width: `${x.open / max * 100}%` }} /></div><span>{x.open + x.answered}</span></div>
      ))}
      <div className="chartLegendInline"><span><i className="answeredKey" />Ответ получен</span><span><i className="openKey" />Открыто</span></div>
    </div>
  );
}

function Filters(props: {
  lab: string; setLab: (v: string) => void;
  level: string; setLevel: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  direction: string; setDirection: (v: string) => void;
  manufacturer: string; setManufacturer: (v: string) => void;
  status: VerificationStatus | "all"; setStatus: (v: VerificationStatus | "all") => void;
  search: string; setSearch: (v: string) => void;
  levels: string[]; directions: string[]; manufacturers: string[]; addresses: string[]; labs: string[];
}) {
  return (
    <div className="filters">
      <select value={props.lab} onChange={(e) => { props.setLab(e.target.value); props.setAddress("all"); }}><option value="all">Все ЦКДЛ</option>{props.labs.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={props.level} onChange={(e) => props.setLevel(e.target.value)}><option value="all">Все уровни</option>{props.levels.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={props.address} onChange={(e) => props.setAddress(e.target.value)}><option value="all">Все адреса</option>{props.addresses.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={props.direction} onChange={(e) => props.setDirection(e.target.value)}><option value="all">Все направления</option>{props.directions.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={props.manufacturer} onChange={(e) => props.setManufacturer(e.target.value)}><option value="all">Все производители</option>{props.manufacturers.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={props.status} onChange={(e) => props.setStatus(e.target.value as VerificationStatus | "all")}>{Object.entries(statusLabels).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select>
      <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Модель, серийник, адрес, комментарий…" />
    </div>
  );
}

function EquipmentTable({ rows, canComment, openComment, canEditHours, openHours }: { rows: Analyzer[]; canComment: (item: Analyzer) => boolean; openComment: (item: Analyzer) => void; canEditHours: (item: Analyzer) => boolean; openHours: (item: Analyzer) => void }) {
  return (
    <div className="tableWrap">
      <table className="equipmentTable">
        <thead><tr><th>ЦКДЛ / адрес</th><th>Уровень</th><th>Направление</th><th>Анализатор</th><th>Серийный №</th><th>Факт</th><th>Мощность</th><th>Часы/мес</th><th>КПД</th><th>Тех. статус</th><th>Расчёт</th><th>Проверка</th><th>Комментарий</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className={x.status === "review" ? "rowReview" : x.status === "error" ? "rowError" : undefined}>
              <td><strong>{x.laboratory}</strong><div className="subtle">{x.address || "адрес не указан"}</div></td>
              <td>{x.level || "—"}</td><td>{x.direction || "—"}</td>
              <td><strong>{x.manufacturer || "—"} {x.model}</strong>{x.sourceModel && x.sourceModel !== x.model && <div className="subtle">норм.: {x.sourceModel}</div>}</td>
              <td>{x.serials.join(", ") || "—"}</td>
              <td>{x.factInCalculation ? fmt(x.factInCalculation) : "—"}</td>
              <td>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</td>
              <td><strong>{x.effectiveHours}</strong>{x.hoursStatus && <div className="subtle">{x.hoursStatus}</div>}{canEditHours(x) && <button className="hoursBtn" onClick={() => openHours(x)}>Изменить</button>}</td>
              <td>{pct(x.rowKpi)}</td><td>{x.technicalStatus || "—"}</td>
              <td>{x.includedInKpi ? <span className="calcYes">Включён</span> : <span className="calcNo">Исключён</span>}</td>
              <td><StatusBadge status={x.status} />{x.question && <div className="questionMini">{x.question}</div>}</td>
              <td>{x.labComment && <div className="commentPreview">{x.labComment}</div>}<button className="commentBtn" disabled={!canComment(x)} onClick={() => openComment(x)}>{x.labComment ? "Изменить" : "Добавить"}</button></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={13} className="empty">Нет позиций по выбранным фильтрам</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TechnicalEquipmentTable({ rows, canComment, openComment, canEditHours, openHours }: { rows: Analyzer[]; canComment: (item: Analyzer) => boolean; openComment: (item: Analyzer) => void; canEditHours: (item: Analyzer) => boolean; openHours: (item: Analyzer) => void }) {
  return (
    <div className="tableWrap technicalTableWrap">
      <table className="equipmentTable technicalTable">
        <thead><tr><th>ЦКДЛ</th><th>МО / адрес</th><th>Уровень / этаж</th><th>Вид</th><th>Производитель / модель</th><th>Инв. №</th><th>Серийный №</th><th>Год / ввод</th><th>Балансодержатель</th><th>Условия владения</th><th>СПИ / износ</th><th>БРЕГИС</th><th>Тех. статус</th><th>Ответственный</th><th>Исходная мощность</th><th>Принятая мощность</th><th>Часы/мес</th><th>КПД</th><th>Верификация</th><th>Источник / комментарии</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className={x.status === "review" ? "rowReview" : x.status === "error" ? "rowError" : undefined}>
              <td><strong>{x.laboratory}</strong></td>
              <td><strong>{x.organization || "—"}</strong><div className="subtle">{x.address || "—"}</div></td>
              <td><strong>{x.level || "—"}</strong><div className="subtle">этаж: {x.floor || "—"}</div></td>
              <td>{x.direction || "—"}</td>
              <td><strong>{x.manufacturer || "—"} {x.model}</strong>{(x.sourceManufacturer || x.sourceModel) && <div className="subtle">норм.: {[x.sourceManufacturer, x.sourceModel].filter(Boolean).join(" ")}</div>}</td>
              <td>{x.inventoryNumber || "—"}</td><td>{x.serials.join(", ") || "—"}</td>
              <td><strong>{x.manufactureYear || "—"}</strong><div className="subtle">ввод: {x.commissioningDate || "—"}</div></td>
              <td>{x.balanceType || "—"}</td><td><div className="technicalLong">{x.balanceHolderDetails || "—"}</div></td>
              <td><strong>{x.usefulLife || "—"}</strong><div className="subtle">износ: {x.depreciation || "—"}</div></td>
              <td>{x.bregisConnection || "—"}</td><td>{x.technicalStatus || "—"}</td>
              <td><div className="technicalLong">{x.responsiblePerson || "—"}</div></td>
              <td>{x.originalCapacity || x.sourceCapacity || "—"}</td>
              <td>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</td>
              <td><strong>{x.effectiveHours}</strong>{x.hoursStatus && <div className="subtle">{x.hoursStatus}</div>}{canEditHours(x) && <button className="hoursBtn" onClick={() => openHours(x)}>Изменить</button>}</td>
              <td>{pct(x.rowKpi)}</td>
              <td><StatusBadge status={x.status} /><div className="subtle">{x.verificationText || "—"}</div></td>
              <td>{x.sourceUrl && <a className="sourceLink inlineSource" href={x.sourceUrl} target="_blank" rel="noreferrer">Источник</a>}{x.powerComment && <div className="subtle technicalLong">{x.powerComment}</div>}{x.labComment && <div className="commentPreview">{x.labComment}</div>}{canComment(x) && <button className="commentBtn" onClick={() => openComment(x)}>{x.labComment ? "Изменить комментарий" : "Добавить комментарий"}</button>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={20} className="empty">Нет позиций по выбранным фильтрам</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
