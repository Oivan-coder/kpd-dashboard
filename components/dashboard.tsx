"use client";

import { useMemo, useState } from "react";
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
  const [equipmentMode, setEquipmentMode] = useState<"work" | "technical">("work");

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
          x.inventoryNumber,
          x.serials.join(" "),
          x.balanceType,
          x.balanceHolderDetails,
          x.bregisConnection,
          x.technicalStatus,
          x.responsiblePerson,
          x.note,
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

  const goLab = () => {
    resetFilters();
    setView("laboratories");
  };

  const goBack = () => {
    if (view === "equipment") {
      if (level !== "all") { setLevel("all"); return; }
      if (direction !== "all") { setDirection("all"); return; }
      if (manufacturer !== "all") { setManufacturer("all"); return; }
      if (status !== "all") { setStatus("all"); return; }
      if (search) { setSearch(""); return; }
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

    if (view === "issues") {
      setView("overview");
      return;
    }
  };

  const showBack =
    view !== "overview" ||
    lab !== "all" ||
    address !== "all" ||
    level !== "all" ||
    direction !== "all" ||
    manufacturer !== "all" ||
    status !== "all" ||
    Boolean(search);

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
        <div className="sideMeta">
          <div className={`sourcePill source-${data.source}`}><span className="sourceDot" />{data.source === "google-sheets" ? "Google Sheets · live" : "Fallback"}</div>
          <span>Август 2026</span>
        </div>
      </aside>

      <section className="workspace">
        <div className="navTrail">
          {showBack && <button className="backButton" onClick={goBack}>← Назад</button>}
          <div className="breadcrumbs">
            <button onClick={goOverview}>Обзор</button>

            {view === "laboratories" && <><span>›</span><strong>ЦКДЛ</strong></>}

            {lab !== "all" && (
              <>
                <span>›</span>
                <button onClick={goLab}>{lab}</button>
              </>
            )}

            {address !== "all" && (
              <>
                <span>›</span>
                <button onClick={() => { setView("equipment"); setLevel("all"); setDirection("all"); setManufacturer("all"); setStatus("all"); setSearch(""); }}>
                  {address}
                </button>
              </>
            )}

            {level !== "all" && <><span>›</span><strong>{level}</strong></>}
            {direction !== "all" && <><span>›</span><strong>{direction}</strong></>}
          </div>
        </div>
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
            {lab === "all" ? (
              <section className="panel">
                <div className="panelHead">
                  <div>
                    <h2>Свод по 8 ЦКДЛ</h2>
                    <p>Выберите ЦКДЛ для детализации по адресам и уровням</p>
                  </div>
                </div>

                <div className="labGrid">
                  {labDetails.map((item) => {
                    const included = item.rows.filter((x) => x.includedInKpi).length;
                    return (
                      <button className="labCard" key={item.name} onClick={() => openLab(item.name)}>
                        <div className="labTitle">
                          <h3>{item.name}</h3>
                          {item.reviewCount > 0 && <span className="dotWarn" />}
                        </div>
                        <div className="kpiValue">{pct(item.kpi)}</div>
                        <div className="bar"><span style={{ width: `${Math.min(item.kpi, 100)}%` }} /></div>
                        <div className="cardMeta">
                          <span>{item.addresses.length} адресов</span>
                          <span>{item.rows.length} позиций</span>
                        </div>
                        <div className="cardMeta">
                          <span>{included} в расчёте</span>
                          <span>{item.reviewCount} уточнений</span>
                        </div>
                        <div className="dataStatus">Открыть ЦКДЛ →</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <>
                <div className="labSelector">
                  <button onClick={() => setLab("all")}>← Все ЦКДЛ</button>
                  {data.laboratories.map((x) => (
                    <button key={x.name} className={lab === x.name ? "active" : ""} onClick={() => setLab(x.name)}>{x.name}</button>
                  ))}
                </div>

                {labDetails.filter((x) => x.name === lab).map((item) => (
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
                          <button key={addr} className="addressRow" onClick={() => { setAddress(addr); setLab(item.name); setView("equipment"); }}>
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
          </>
        )}

        {view === "equipment" && (
          <section className="panel">
            <div className="panelHead registryHead">
              <div>
                <h2>{equipmentMode === "work" ? "Полный перечень оборудования" : "Технический реестр оборудования"}</h2>
                <p>
                  {equipmentMode === "work"
                    ? "Рабочий вид: загрузка, мощность, КПД и статус проверки"
                    : "Технический вид: все исходные сведения по каждой учётной позиции"}
                </p>
              </div>
              <div className="registryHeadRight">
                <div className="registrySwitch">
                  <button className={equipmentMode === "work" ? "active" : ""} onClick={() => setEquipmentMode("work")}>Рабочий вид</button>
                  <button className={equipmentMode === "technical" ? "active" : ""} onClick={() => setEquipmentMode("technical")}>Технический реестр</button>
                </div>
                <div className="count">{filtered.length} из {data.analyzers.length}</div>
              </div>
            </div>
            <Filters {...{lab,setLab,level,setLevel,address,setAddress,direction,setDirection,manufacturer,setManufacturer,status,setStatus,search,setSearch,levels,directions,manufacturers,addresses,labs:data.laboratories.map(x=>x.name)}} />
            {equipmentMode === "work"
              ? <EquipmentTable rows={filtered} />
              : <TechnicalEquipmentTable rows={filtered} />}
          </section>
        )}

        {view === "issues" && (
          <section className="panel">
            <div className="panelHead">
              <div><h2>Что нужно уточнить</h2><p>Каждая карточка содержит конкретный вопрос для заведующего ЦКДЛ</p></div>
              <div className="count">{reviewRows.length} позиций</div>
            </div>
            <div className="issuesWorkspace">
              {reviewRows.map((x) => (
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
                    <span>Вопрос ЦКДЛ</span>
                    <strong>{x.question}</strong>
                  </div>
                  <div className="answerRoute">
                    <span>Маршрут ответа</span>
                    <p>Заведующий открывает эту позицию, вносит уточнение и подтверждает данные. Ответ сохраняется в рабочую Google Таблицу; после проверки РЦ статус меняется на «Проверено».</p>
                    <button disabled>Ответить на позицию — подключаем авторизацию</button>
                  </div>
                  {x.sourceUrl && <a className="sourceLink" href={x.sourceUrl} target="_blank" rel="noreferrer">Паспортный источник мощности →</a>}
                </article>
              ))}
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

function TechnicalEquipmentTable({rows}:{rows:Analyzer[]}) {
  return (
    <div className="tableWrap technicalTableWrap">
      <table className="equipmentTable technicalTable">
        <thead>
          <tr>
            <th>ЦКДЛ</th>
            <th>МО / адрес</th>
            <th>Уровень / этаж</th>
            <th>Вид оборудования</th>
            <th>Производитель / модель</th>
            <th>Инвентарный №</th>
            <th>Серийный №</th>
            <th>Год / ввод</th>
            <th>Балансодержатель</th>
            <th>Условия владения</th>
            <th>СПИ / износ</th>
            <th>БРЕГИС</th>
            <th>Тех. статус</th>
            <th>Ответственный</th>
            <th>Исходная мощность</th>
            <th>Принятая мощность</th>
            <th>В расчёте КПД</th>
            <th>Верификация</th>
            <th>Источник / комментарий</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id} className={x.status === "review" ? "rowReview" : x.status === "error" ? "rowError" : undefined}>
              <td><strong>{x.laboratory}</strong></td>
              <td>
                <strong>{x.organization || "—"}</strong>
                <div className="subtle">{x.address || "адрес не указан"}</div>
              </td>
              <td>
                <strong>{x.level || "—"}</strong>
                <div className="subtle">этаж: {x.floor || "—"}</div>
              </td>
              <td>{x.direction || "—"}</td>
              <td>
                <strong>{x.manufacturer || "—"} {x.model}</strong>
                {(x.sourceManufacturer || x.sourceModel) && (
                  <div className="subtle">исходно: {[x.sourceManufacturer, x.sourceModel].filter(Boolean).join(" ")}</div>
                )}
              </td>
              <td>{x.inventoryNumber || "—"}</td>
              <td>{x.serials.join(", ") || "—"}</td>
              <td>
                <strong>{x.manufactureYear || "—"}</strong>
                <div className="subtle">ввод: {x.commissioningDate || "—"}</div>
              </td>
              <td>{x.balanceType || "—"}</td>
              <td><div className="technicalLong">{x.balanceHolderDetails || "—"}</div></td>
              <td>
                <strong>{x.usefulLife || "—"}</strong>
                <div className="subtle">износ: {x.depreciation || "—"}</div>
              </td>
              <td>{x.bregisConnection || "—"}</td>
              <td>{x.technicalStatus || "—"}</td>
              <td><div className="technicalLong">{x.responsiblePerson || "—"}</div></td>
              <td>
                <strong>{x.originalCapacity || x.sourceCapacity || "—"}</strong>
                {x.sourceCapacity && x.sourceCapacity !== x.originalCapacity && <div className="subtle">норм.: {x.sourceCapacity}</div>}
              </td>
              <td>{x.capacityPerHour ? `${fmt(x.capacityPerHour)} ${labelUnit(x)}` : "—"}</td>
              <td>{x.includedInKpi ? <span className="calcYes">Да</span> : <span className="calcNo">Нет</span>}</td>
              <td>
                <StatusBadge status={x.status} />
                <div className="subtle">{x.verificationText || "—"}</div>
              </td>
              <td>
                {x.sourceUrl ? <a className="sourceLink inlineSource" href={x.sourceUrl} target="_blank" rel="noreferrer">Источник</a> : "—"}
                {x.powerComment && <div className="technicalLong subtle">{x.powerComment}</div>}
                {x.reasonComment && <div className="technicalLong subtle">{x.reasonComment}</div>}
                {x.note && <div className="technicalLong subtle">Примечание: {x.note}</div>}
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={19} className="empty">Нет позиций по выбранным фильтрам</td></tr>}
        </tbody>
      </table>
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
