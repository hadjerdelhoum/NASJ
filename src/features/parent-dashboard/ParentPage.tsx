import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../../app/api";
import { useChildren, useProgress } from "../../app/state";
import type { Dashboard } from "../../app/types";
import { Btn, ChildAvatar, ErrorNote, ProgressRing, Spinner } from "../../components/ui";
import { useI18n } from "../../i18n";
import { MascotFace } from "../mascot/Mascot";
import { WovenBridge } from "../rewards/WovenBridge";
import { earnedRows } from "../rewards/weave";
import { worldMeta } from "../worlds/worlds";

const GATE_KEY = "nasj.parentGate";

/** A tiny sum keeps small children out of the parent area (this is a gate, not security: the API is token-protected). */
function Gate({ onPass }: { onPass: () => void }) {
  const { t } = useI18n();
  const [a, b] = useMemo(() => [4 + Math.floor(Math.random() * 6), 3 + Math.floor(Math.random() * 6)], []);
  const [val, setVal] = useState("");
  const [bad, setBad] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (Number(val) === a + b) {
      try {
        sessionStorage.setItem(GATE_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
      onPass();
    } else {
      setBad(true);
      setVal("");
    }
  };
  return (
    <form className="card gate" onSubmit={submit}>
      <MascotFace mood="curious" size={80} />
      <h1>{t("gateTitle")}</h1>
      <label className="field">
        <span dir="ltr">{t("gateAsk", { a, b })}</span>
        <input inputMode="numeric" pattern="[0-9]*" value={val} onChange={(e) => { setVal(e.target.value); setBad(false); }} dir="ltr" autoFocus />
      </label>
      {bad && <p className="form-error" role="alert">{t("gateWrong")}</p>}
      <Btn type="submit" disabled={!val}>{t("enter")}</Btn>
    </form>
  );
}

function recentlyPassed() {
  try {
    const at = Number(sessionStorage.getItem(GATE_KEY));
    return at > 0 && Date.now() - at < 10 * 60_000;
  } catch {
    return false;
  }
}

export default function ParentPage() {
  const { t, pick } = useI18n();
  const { child, children, avatarOf, select } = useChildren();
  const { universes, earned } = useProgress();
  const [open, setOpen] = useState(recentlyPassed);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !child) return;
    setData(null);
    setError(false);
    api.dashboard(child.id).then(setData).catch(() => setError(true));
  }, [open, child]);

  if (!open) return <Gate onPass={() => setOpen(true)} />;
  if (!child) return null;

  return (
    <div className="parent">
      <h1 className="page-title">{t("parentSpace")}</h1>

      <section className="card parent__child">
        <ChildAvatar who={avatarOf(child.id)} size={72} />
        <div>
          <h2>{child.name}</h2>
          <p className="muted">{child.age} {t("years")}</p>
        </div>
        {children.length > 1 && (
          <select aria-label={t("switchChild")} value={child.id} onChange={(e) => select(e.target.value)}>
            {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </section>

      {error && <ErrorNote onRetry={() => setOpen(true)} retryLabel={t("retry")}>{t("errNetwork")}</ErrorNote>}
      {!data && !error && <Spinner label={t("loading")} />}

      {data && (
        <>
          <section className="card parent__overall">
            <ProgressRing value={data.overall} size={96} />
            <h2>{t("overall")}</h2>
          </section>
          <ul className="parent__grid">
            {data.universes.map((u) => {
              const w = worldMeta(u.universe_id);
              const uni = universes?.find((x) => x.id === u.universe_id);
              return (
                <li key={u.universe_id} className="card parent__world">
                  <header>
                    <strong style={{ color: w.accentDark }}>{pick({ fr: u.name_fr, ar: u.name_ar })}</strong>
                    <span>{t("activitiesDone", { c: u.completed, t: u.total })}</span>
                  </header>
                  <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((u.completed / u.total) * 100)}>
                    <i style={{ width: `${(u.completed / u.total) * 100}%`, background: w.accent }} />
                  </div>
                  <dl>
                    <div><dt>{t("avgScore")}</dt><dd>{u.attempts ? `${Math.round(u.avg_score * 100)}%` : "—"}</dd></div>
                    <div><dt>{t("attempts")}</dt><dd>{u.attempts}</dd></div>
                  </dl>
                  {uni && <WovenBridge rows={earnedRows(u.universe_id, earned)} className="bridge--mini" />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
