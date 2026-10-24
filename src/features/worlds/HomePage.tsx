import { Link } from "react-router-dom";
import { useChildren, useProgress } from "../../app/state";
import type { Universe } from "../../app/types";
import { ErrorNote, Ribbon, Spinner, ThreadPath, useMedia } from "../../components/ui";
import { useI18n } from "../../i18n";
import { audio } from "../audio/audioService";
import { MascotBody } from "../mascot/Mascot";
import { useVariant } from "../mascot/variants";
import { StitchBar } from "../rewards/WovenBridge";
import { WORLDS, activityIcon, worldMeta } from "./worlds";

function ArtIcon({ a }: { a: Universe["activities"][number] }) {
  const ic = activityIcon(a);
  return ic.src ? <img src={ic.src} alt="" loading="lazy" /> : <span className="emoji-ico" aria-hidden="true">{ic.emoji}</span>;
}

/** Desktop / tablet: the five panels laid out like the reference board (3 on top, 2 wider below). */
function Panel({ u }: { u: Universe }) {
  const { t, lang, pick } = useI18n();
  const w = worldMeta(u.id);
  const done = u.activities.filter((a) => a.completed).length;
  return (
    <Link
      to={`/world/${u.id}`}
      className={`panel panel--${u.id}`}
      style={{ ["--t1" as string]: w.tint[0], ["--t2" as string]: w.tint[1], ["--accent" as string]: w.accent }}
      onClick={() => void audio.effect("click")}
      aria-label={`${u.name_fr} — ${u.name_ar}`}
    >
      <Ribbon world={u.id} fr={u.name_fr} ar={u.name_ar} />
      <div className="panel__body">
        <div className="panel__text">
          <p lang="fr" dir="ltr">{u.description_fr}</p>
          <p lang="ar" dir="rtl">{u.description_ar}</p>
        </div>
        <div className="panel__art">
          <img src={w.art} alt="" style={{ objectPosition: w.artPos, ...(w.artRatio ? { aspectRatio: w.artRatio } : {}) }} loading="lazy" />
        </div>
      </div>
      <div className="panel__examples">
        <div className="panel__examples-head">
          <small>{t("examples")}</small>
          <span className="panel__progress">
            <StitchBar done={u.activities.map((a) => a.completed)} />
            <b>{done}/{u.activities.length}</b>
          </span>
        </div>
        <ul>
          {u.activities.slice(0, 4).map((a) => (
            <li key={a.id}>
              <ArtIcon a={a} />
              <span>{pick({ fr: a.title_fr, ar: a.title_ar })}</span>
            </li>
          ))}
        </ul>
      </div>
      <span className="visually-hidden">{lang === "ar" ? u.name_ar : u.name_fr}</span>
    </Link>
  );
}

/** Phone: a vertical journey. Each world is a big floating illustration joined to the next by a woven rope. */
function Journey({ universes }: { universes: Universe[] }) {
  const { t, pick } = useI18n();
  return (
    <ol className="journey">
      {universes.map((u, i) => {
        const w = worldMeta(u.id);
        const done = u.activities.filter((a) => a.completed).length;
        return (
          <li key={u.id} className={`stop stop--${i % 2 ? "right" : "left"}`}>
            <Link to={`/world/${u.id}`} className="stop__link" onClick={() => void audio.effect("click")} style={{ ["--accent" as string]: w.accent }}>
              <div className="stop__art">
                <img src={w.art} alt="" style={{ objectPosition: w.artPos }} loading={i < 2 ? "eager" : "lazy"} />
              </div>
              <div className="stop__label">
                <Ribbon world={u.id} fr={u.name_fr} ar={u.name_ar} small />
              </div>
              <p className="stop__desc" lang={pick({ fr: "fr", ar: "ar" })}>{pick({ fr: u.description_fr, ar: u.description_ar })}</p>
              <div className="stop__meta">
                <StitchBar done={u.activities.map((a) => a.completed)} />
                <b>{t("threadsWoven", { n: done, total: u.activities.length })}</b>
              </div>
            </Link>
            {i < universes.length - 1 && <ThreadPath flip={i % 2 === 1} />}
          </li>
        );
      })}
    </ol>
  );
}

export function HomePage() {
  const { t } = useI18n();
  const { child } = useChildren();
  const { universes, error, refresh, threads } = useProgress();
  const wide = useMedia("(min-width: 900px)");
  const [variant] = useVariant(child?.id, threads);

  if (error && !universes) return <ErrorNote onRetry={refresh} retryLabel={t("retry")}>{t("errNetwork")}</ErrorNote>;
  if (!universes) return <Spinner label={t("loading")} />;

  const ordered = WORLDS.map((w) => universes.find((u) => u.id === w.id)).filter(Boolean) as Universe[];

  return (
    <div className="home">
      <header className="home__hero">
        <div className="home__mascot" aria-hidden="true">
          <span className="cloud" />
          <MascotBody variant={variant} height={wide ? 190 : 150} />
        </div>
        <div className="home__brand">
          <img src="/img/logo/logo-horizontal.png" alt="NASJ نسج" className="home__logo" />
          <p className="home__tagline">{t("tagline")}</p>
        </div>
        <p className="home__note hand" aria-hidden={!wide}>
          {t("fiveWorlds")}
          <svg viewBox="0 0 90 50" width="90" height="50" aria-hidden="true"><path d="M5 45C30 40 60 25 80 6M80 6l-14 2M80 6l-3 14" fill="none" stroke="#17908A" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </p>
      </header>

      {wide ? (
        <section className="board" aria-label={t("chooseWorld")}>
          {ordered.slice(0, 3).map((u) => (
            <div className="board__cell board__cell--third" key={u.id}><Panel u={u} /></div>
          ))}
          <div className="board__cell board__cell--half">{ordered[3] && <Panel u={ordered[3]} />}</div>
          <p className="board__note hand">
            {t("everyWorld")}
            <img src="/img/ui/thread-knot.png" alt="" width={90} />
          </p>
          <div className="board__cell board__cell--half">{ordered[4] && <Panel u={ordered[4]} />}</div>
        </section>
      ) : (
        <section aria-label={t("chooseWorld")}>
          <h1 className="visually-hidden">{t("chooseWorld")}</h1>
          <Journey universes={ordered} />
          <p className="home__end hand">{t("everyWorld")}</p>
        </section>
      )}
    </div>
  );
}
