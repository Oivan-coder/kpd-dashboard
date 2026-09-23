"use client";

import { useEffect, useMemo, useState } from "react";
import type { Analyzer, DashboardData, VerificationStatus } from "@/lib/types";
import { StatusBadge } from "./status-badge";

type View = "overview" | "laboratories" | "equipment" | "issues";

function fmt(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
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
  const [accessLab, setAccessLab] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessBusy, setAccessBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, { response: string; confirmedBy: string; busy?: boolean; error?: string; saved?: boolean }>>({});

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then((s) => setAccessLab(s.laboratory ?? null))
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
      setAccessLab(body.laboratory);
      setAccessCode("");
      setView("issues");
    } catch (e) {
      setAccessError(e instanceof Error ? e.message : "Ошибка входа");
    } finally {
      setAccessBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/session", { method: "DELETE" });
    setAccessLab(null);
  };

  const updateAnswer = (id: string, patch: Partial<{ response: string; confirmedBy: string; busy: boolean; error: string; saved: boolean }>) => {
    setAnswers((prev) => ({ ...prev, [id]: { response: "", confirmedBy: "", ...prev[id], ...patch } }));
  };

  const submitAnswer = async (item: Analyzer) => {
    const state = answers[item.id] ?? { response: "", confirmedBy: "" };
    updateAnswer(item.id, { busy: true, error: "", saved: false });
    try {
      const r = await fetch("/api/clarifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, response: state.response, confirmedBy: state.confirmedBy }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || "Не удалось сохранить");
      updateAnswer(item.id, { busy: false, saved: true });
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      updateAnswer(item.id, { busy: false, error: e instanceof Error ? e.message : "Ошибка сохранения" });
    }
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
          x.laboratory,
          x.organization,
          x.address,
          x.level,
          x.direction,
          x.manufacturer,
          x.model,
          x.serials.join(" "),
          x.issue ?? "",
          x.question ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [data.analyzers, lab, level, address, direction, manufacturer, status, search]);

  const levelGroups = useMemo(
    () =>
      levels.map((name) => {
        const rows = data.analyzers.filter((x) => x.level === name);
        return { name, ...groupKpi(rows) };
      }),
    [data.analyzers, levels]
  );

  const labDetails = useMemo(() => {
    return data.laboratories.map((l) => {
      const rows = data.analyzers.filter((x) => x.laboratory === l.name);
      const addresses = [...new Set(rows.map((x) => x.address).filter(Boolean))];
      const levelBreakdown = [...new Set(rows.map((x) => x.level).filter(Boolean))].map((name) => ({
        name,
        ...groupKpi(rows.filter((x) => x.level === name)),
      }));
      return { ...l, rows, addresses, levelBreakdown };
    });
  }, [data]);

  const openLab = (name: string) => {
    setLab(name);
    setAddress("all");
    setLevel("all");
    setDirection("all");
    setManufacturer("all");
    setStatus("all");
    setView("laboratories");
  };

  const reviewTotal = reviewRows.length;
  const verifiedTotal = data.analyzers.filter((x) => x.status === "verified").length;
  const excludedTotal = data.analyzers.filter((x) => x.status === "excluded").length;

  return (
    <main className="appShell">
      <aside className="sideNav">
        <div className="brand">
          <div className="brandMark">РЦ</div>
          <div><strong>КПД оборудования</strong><span>Лабораторная служба МО</span></div>
        </div>
        <nav>
          <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>Обзор</button>
          <button className={view === "laboratories" ? "active" : ""} onClick={() => setView("laboratories")}>ЦКДЛ</button>
          <button className={view === "equipment" ? "active" : ""} onClick={() => { setStatus("all"); setView("equipment"); }}>Оборудование</button>
          <button className={view === "issues" ? "active" : ""} onClick={() => setView("issues")}>
            Уточнения <span className="navCount">{reviewTotal}</span>
          </button>
        </nav>
        <div className="accessPanel">
          {accessLab ? (
            <>
              <span className="accessLabel">Редактирование</span>
              <strong>{accessLab}</strong>
              <button onClick={() => { setLab(accessLab); setView("issues"); }}>Мои уточнения</button>
              <button className="ghostAccess" onClick={logout}>Выйти</button>
            </>
          ) : (
            <>
              <span className="accessLabel">Для заведующего ЦКДЛ</span>
              <input
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="Код доступа"
                autoComplete="off"
              />
              <button onClick={login} disabled={accessBusy || !accessCode.trim()}>
                {accessBusy ? "Проверяем…" : "Войти для ответа"}
              </button>
              {accessError && <span className="accessError">{accessError}</span>}
            </>
          )}
        </div>
        <div className="sideMeta">
          <div className={`sourcePill source-${data.source}`}><span className="sourceDot" />{data.source === "google-sheets" ? "Google Sheets · live" : "Fallback"}</div>
          <span>Август 2026</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="pageHeader">
          <div>
            <div className="eyebrow">Референс-центр лабораторной службы</div>
            <h1>{view === "overview" ? "Обзор загрузки" : view === "laboratories" ? "ЦКДЛ и уровни" : view === "equipment" ? "Полный реестр оборудования" : "Уточнения ЦКДЛ"}</h1>
            <p>
              {view === "overview" && "КПД, мощность, структура парка и качество исходных данных"}
              {view === "laboratories" && "Детализация по кустам, адресам и уровням лабораторий"}
              {view === "equipment" && "Весь парк, включая 1 уровень, экспресс, исключённое и неработающее оборудование"}
              {view === "issues" && "Только позиции, где от ЦКДЛ нужен конкретный ответ"}
            </p>
          </div>
        </header>

        {view === "overview" && (
          <>
            <section className="metrics">
              <article className="metric"><span>Общий КПД</span><strong>{pct(data.totalKpi)}</strong><small>{fmt(data.totalFact)} исследований</small></article>
              <article className="metric"><span>Мощность</span><strong>{fmt(data.totalCapacityPerHour)}</strong><small>ед./ч · {fmt(data.totalAnalyzersInCapacity)} приборов в знаменателе</small></article>
              <article className="metric"><span>Весь парк</span><strong>{fmt(data.analyzers.length)}</strong><small>{fmt(excludedTotal)} не участвуют в КПД</small></article>
              <article className="metric warn"><span>Нужно уточнить</span><strong>{reviewTotal}</strong><small>{verifiedTotal} позиций верифицировано</small></article>
            </section>

            <div className="overviewGrid">
              <section className="panel">
                <div className="panelHead"><div><h2>КПД по ЦКДЛ</h2><p>Нажмите на куст для детализации</p></div></div>
                <div className="rankList">
                  {[...data.laboratories].sort((a,b) => b.kpi-a.kpi).map((item) => (
                    <button key={item.name} className="rankRow" onClick={() => openLab(item.name)}>
                      <div className="rankName"><strong>{item.name}</strong><span>{item.reviewCount ? `${item.reviewCount} уточн.` : "без вопросов"}</span></div>
                      <div className="rankBar"><span style={{width:`${Math.min(item.kpi,100)}%`}} /></div>
                      <strong>{pct(item.kpi)}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panelHead"><div><h2>КПД по уровням</h2><p>Расчёт из строк, где одновременно есть факт и мощность</p></div></div>
                <div className="levelTiles">
                  {levelGroups.map((g) => (
                    <article key={g.name} className="levelTile">
                      <span>{g.name}</span>
                      <strong>{pct(g.kpi)}</strong>
                      <small>{g.included} приборов · {fmt(g.fact)} факт</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel">
              <div className="panelHead"><div><h2>ЦКДЛ</h2><p>Объём, мощность, парк и проблемные позиции</p></div></div>
              <div className="labGrid">
                {data.laboratories.map((item) => (
                  <button className="labCard" key={item.name} onClick={() => openLab(item.name)}>
                    <div className="labTitle"><h3>{item.name}</h3>{item.reviewCount > 0 && <span className="dotWarn" />}</div>
                    <div className="kpiValue">{pct(item.kpi)}</div>
                    <div className="bar"><span style={{width:`${Math.min(item.kpi,100)}%`}} /></div>
                    <div className="cardMeta"><span>{fmt(item.capacityPerHour)} ед./ч</span><span>{item.reviewCount ? `${item.reviewCount} уточн.` : "без вопросов"}</span></div>
                    <div className="dataStatus">{item.dataStatus}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel issuePreview">
              <div className="panelHead">
                <div><h2>Критичные уточнения</h2><p>Только те вопросы, которые реально меняют мощность или состав парка</p></div>
                <button className="textButton" onClick={() => setView("issues")}>Все уточнения →</button>
              </div>
              <div className="issueGrid">
                {reviewRows.slice(0,6).map((x) => (
                  <article className="issueCard" key={x.id}>
                    <div className="issueTop"><strong>{x.laboratory}</strong><StatusBadge status={x.status} /></div>
                    <h3>{x.manufacturer} {x.model}</h3>
                    <p>{x.question}</p>
                    <div className="issueMeta"><span>{x.level}</span><span>{x.address || "адрес не указан"}</span></div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {view === "laboratories" && (
          <>
            <div className="labSelector">
              <button className={lab === "all" ? "active" : ""} onClick={() => setLab("all")}>Все ЦКДЛ</button>
              {data.laboratories.map((x) => <button key={x.name} className={lab === x.name ? "active" : ""} onClick={() => setLab(x.name)}>{x.name}</button>)}
            </div>

            {(lab === "all" ? labDetails : labDetails.filter((x) => x.name === lab)).map((item) => (
              <section className="labWorkspace panel" key={item.name}>
                <div className="labWorkspaceHead">
                  <div>
                    <h2>{item.name}</h2>
                    <p>{item.addresses.length} адресов · {item.rows.length} единиц оборудования · {item.analyzers} приборов в расчёте мощности</p>
                  </div>
                  <div className="bigKpi"><span>КПД</span><strong>{pct(item.kpi)}</strong></div>
                </div>

                <div className="levelBreakdown">
                  {item.levelBreakdown.map((g) => (
                    <article key={g.name}>
                      <span>{g.name}</span>
                      <strong>{pct(g.kpi)}</strong>
                      <small>{g.count} позиций · {g.included} в расчёте · {g.issues} вопросов</small>
                    </article>
                  ))}
                </div>

                <div className="addressList">
                  {item.addresses.map((addr) => {
                    const rows = item.rows.filter((x) => x.address === addr);
                    const g = groupKpi(rows);
                    return (
                      <button key={addr} className="addressRow" onClick={() => {setAddress(addr);setLab(item.name);setView("equipment");}}>
                        <div><strong>{addr}</strong><span>{rows.length} единиц оборудования</span></div>
                        <div><span>КПД адреса</span><strong>{pct(g.kpi)}</strong></div>
                        <div><span>В расчёте</span><strong>{g.included}</strong></div>
                        <div><span>Уточнений</span><strong>{g.issues}</strong></div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}

        {view === "equipment" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Полный перечень оборудования</h2><p>По умолчанию показаны все позиции, а не только проблемные</p></div>
              <div className="count">{filtered.length} из {data.analyzers.length}</div>
            </div>
            <Filters {...{lab,setLab,level,setLevel,address,setAddress,direction,setDirection,manufacturer,setManufacturer,status,setStatus,search,setSearch,levels,directions,manufacturers,addresses,labs:data.laboratories.map(x=>x.name)}} />
            <EquipmentTable rows={filtered} />
          </section>
        )}

        {view === "issues" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Что нужно уточнить</h2><p>Каждая карточка содержит конкретный вопрос для заведующего ЦКДЛ</p></div>
              <div className="count">{reviewRows.length} позиций</div>
            </div>
            {!accessLab && (
              <div className="issuesNotice">
                Просматривать вопросы можно без входа. Чтобы отправить уточнение, заведующий ЦКДЛ вводит свой код доступа в левом меню.
              </div>
            )}
            {accessLab && (
              <div className="issuesNotice accessGranted">
                Режим редактирования: <strong>{accessLab}</strong>. Формы ответа доступны только для этого куста.
              </div>
            )}
            <div className="issuesWorkspace">
              {reviewRows
                .filter((x) => !accessLab || x.laboratory === accessLab || lab === "all")
                .map((x) => {
                  const form = answers[x.id] ?? { response: "", confirmedBy: "" };
                  const editable = accessLab === x.laboratory;
                  return (
                    <article className="issueDetailCard" key={x.id}>
                      <div className="issueDetailHead">
                        <div>
                          <div className="issueBreadcrumb">{x.laboratory} · {x.level}</div>
                          <h3>{x.manufacturer} {x.model}</h3>
                        </div>
                        <StatusBadge status={x.status} />
                      </div>
                      <div className="issueFacts">
                        <div><span>Адрес</span><strong>{x.address || "не указан"}</strong></div>
                        <div><span>Серийный номер</span><strong>{x.serials.join(", ") || "не указан"}</strong></div>
                        <div><span>Сейчас принято</span><strong>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</strong></div>
                        <div><span>Тех. статус</span><strong>{x.technicalStatus || "—"}</strong></div>
                      </div>
                      <div className="questionBox">
                        <span>Что нужно уточнить</span>
                        <strong>{x.question}</strong>
                      </div>

                      {x.response ? (
                        <div className="submittedAnswer">
                          <span>Ответ ЦКДЛ получен</span>
                          <p>{x.response}</p>
                          <small>{x.confirmedBy}{x.confirmedAt ? ` · ${x.confirmedAt}` : ""}</small>
                        </div>
                      ) : editable ? (
                        <div className="answerForm">
                          <label>
                            <span>Ответ / уточняющая информация</span>
                            <textarea
                              value={form.response}
                              onChange={(e) => updateAnswer(x.id, { response: e.target.value })}
                              placeholder="Например: комплекс состоит из 2 × XN-10 и 1 × SP-10. Серийные номера…"
                              rows={4}
                            />
                          </label>
                          <label>
                            <span>ФИО и должность подтверждающего</span>
                            <input
                              value={form.confirmedBy}
                              onChange={(e) => updateAnswer(x.id, { confirmedBy: e.target.value })}
                              placeholder="Иванова И.И., заведующий КДЛ"
                            />
                          </label>
                          {form.error && <div className="formError">{form.error}</div>}
                          {form.saved && <div className="formSuccess">Ответ сохранён. Обновляем данные…</div>}
                          <button
                            className="submitAnswer"
                            onClick={() => submitAnswer(x)}
                            disabled={form.busy || !form.response.trim() || !form.confirmedBy.trim()}
                          >
                            {form.busy ? "Сохраняем…" : "Отправить уточнение"}
                          </button>
                        </div>
                      ) : (
                        <div className="answerRoute">
                          <span>Маршрут ответа</span>
                          <p>
                            Эта позиция редактируется только после входа под кодом <strong>{x.laboratory}</strong>.
                            Ответ будет записан прямо в рабочую таблицу и попадёт в журнал изменений.
                          </p>
                        </div>
                      )}
                      {x.sourceUrl && <a className="sourceLink" href={x.sourceUrl} target="_blank" rel="noreferrer">Паспортный источник мощности →</a>}
                    </article>
                  );
                })}
            </div>
          </section>
        )}

        <footer><span>Источник: рабочая Google Таблица</span><span>Обновлено: {new Date(data.updatedAt).toLocaleString("ru-RU")}</span></footer>
      </section>
    </main>
  );
}

function Filters(props: any) {
  return (
    <div className="filters">
      <select value={props.lab} onChange={(e) => {props.setLab(e.target.value);props.setAddress("all");}}>
        <option value="all">Все ЦКДЛ</option>{props.labs.map((x:string)=><option key={x}>{x}</option>)}
      </select>
      <select value={props.level} onChange={(e) => props.setLevel(e.target.value)}>
        <option value="all">Все уровни</option>{props.levels.map((x:string)=><option key={x}>{x}</option>)}
      </select>
      <select value={props.address} onChange={(e) => props.setAddress(e.target.value)}>
        <option value="all">Все адреса</option>{props.addresses.map((x:string)=><option key={x}>{x}</option>)}
      </select>
      <select value={props.direction} onChange={(e) => props.setDirection(e.target.value)}>
        <option value="all">Все направления</option>{props.directions.map((x:string)=><option key={x}>{x}</option>)}
      </select>
      <select value={props.manufacturer} onChange={(e) => props.setManufacturer(e.target.value)}>
        <option value="all">Все производители</option>{props.manufacturers.map((x:string)=><option key={x}>{x}</option>)}
      </select>
      <select value={props.status} onChange={(e) => props.setStatus(e.target.value)}>
        {Object.entries(statusLabels).map(([k,v]) => <option value={k} key={k}>{v}</option>)}
      </select>
      <input value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder="Модель, серийник, адрес…" />
    </div>
  );
}

function EquipmentTable({rows}:{rows:Analyzer[]}) {
  return (
    <div className="tableWrap">
      <table className="equipmentTable">
        <thead><tr>
          <th>ЦКДЛ / адрес</th><th>Уровень</th><th>Направление</th><th>Анализатор</th><th>Серийные номера</th>
          <th>Факт</th><th>Мощность</th><th>КПД прибора</th><th>Тех. статус</th><th>Расчёт</th><th>Проверка</th>
        </tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className={x.status==="review"?"rowReview":x.status==="error"?"rowError":undefined}>
              <td><strong>{x.laboratory}</strong><div className="subtle">{x.address || "адрес не указан"}</div></td>
              <td>{x.level || "—"}</td>
              <td>{x.direction || "—"}</td>
              <td><strong>{x.manufacturer || "—"} {x.model}</strong>{x.sourceModel && x.sourceModel !== x.model && <div className="subtle">исходно: {x.sourceModel}</div>}</td>
              <td>{x.serials.join(", ") || "—"}</td>
              <td>{x.factInCalculation ? fmt(x.factInCalculation) : "—"}</td>
              <td>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</td>
              <td>{pct(x.rowKpi)}</td>
              <td>{x.technicalStatus || "—"}</td>
              <td>{x.includedInKpi ? <span className="calcYes">Включён</span> : <span className="calcNo">Исключён</span>}</td>
              <td><StatusBadge status={x.status} />{x.question && <div className="questionMini">{x.question}</div>}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={11} className="empty">Нет позиций по выбранным фильтрам</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
