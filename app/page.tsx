import { analyzers, laboratories } from "@/lib/mock-data";
import { StatusBadge } from "@/components/status-badge";

export default function Home() {
  const reviewTotal = analyzers.filter((x) => x.status === "review").length;
  const verifiedTotal = analyzers.filter((x) => x.status === "verified").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Референс-центр лабораторной службы</div>
          <h1>Загрузка лабораторного оборудования</h1>
          <p>Верификация парка, паспортной мощности и расчёт КПД по ЦКДЛ</p>
        </div>
        <div className="period">Август 2026</div>
      </header>

      <section className="metrics">
        <article className="metric"><span>ЦКДЛ</span><strong>8</strong></article>
        <article className="metric"><span>Общий КПД</span><strong>31,6%</strong></article>
        <article className="metric warn"><span>Требуют уточнения</span><strong>{reviewTotal}</strong></article>
        <article className="metric"><span>Проверено в демо</span><strong>{verifiedTotal}</strong></article>
      </section>

      <section>
        <div className="sectionHead">
          <div><h2>ЦКДЛ</h2><p>Сводная загрузка и качество исходных данных</p></div>
        </div>
        <div className="labGrid">
          {laboratories.map((lab) => (
            <article className="labCard" key={lab.name}>
              <div className="labTitle"><h3>{lab.name}</h3>{lab.reviewCount > 0 && <span className="dotWarn" />}</div>
              <div className="kpiValue">{lab.kpi.toFixed(1)}%</div>
              <div className="bar"><span style={{ width: `${Math.min(lab.kpi, 100)}%` }} /></div>
              <div className="cardMeta">
                <span>КПД</span>
                <span>{lab.reviewCount ? `${lab.reviewCount} вопрос` : "данные без замечаний"}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="registry">
        <div className="sectionHead">
          <div><h2>Позиции, требующие верификации</h2><p>Жёлтым отмечаются конкретные поля, которые должна подтвердить ЦКДЛ</p></div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ЦКДЛ</th><th>Уровень</th><th>Направление</th><th>Анализатор</th><th>Серийные номера</th><th>Мощность</th><th>Статус</th><th>Что уточнить</th>
              </tr>
            </thead>
            <tbody>
              {analyzers.map((item) => (
                <tr key={item.id} className={item.status === "review" ? "rowReview" : undefined}>
                  <td><strong>{item.laboratory}</strong></td>
                  <td>{item.level}</td>
                  <td>{item.direction}</td>
                  <td>{item.manufacturer} {item.model}</td>
                  <td>{item.serials.join(", ")}</td>
                  <td>{item.capacityPerHour ?? "—"} {item.capacityPerHour ? (item.capacityUnit === "samples/hour" ? "проб/ч" : "тест/ч") : ""}</td>
                  <td><StatusBadge status={item.status} /></td>
                  <td>{item.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
