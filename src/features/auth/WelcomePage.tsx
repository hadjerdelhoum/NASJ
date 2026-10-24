import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/state";
import { Btn } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { ar as arDict, fr as frDict } from "../../i18n/dictionary";
import { useI18n } from "../../i18n";
import { audio } from "../audio/audioService";
import { FAMILY, FamilyPortrait, MascotBody, MascotFace } from "../mascot/Mascot";
import { LangSwitch } from "../settings/LangSwitch";

/** Two-step entrance, as on the app-screens board: logo + "tap to start", then the mascot says hello. */
export function WelcomePage() {
  const { t, lang } = useI18n();
  const { token } = useAuth();
  const nav = useNavigate();
  const [stage, setStage] = useState<0 | 1>(0);

  const begin = () => {
    audio.unlock();
    void audio.effect("welcome");
    setStage(1);
    window.setTimeout(() => void audio.speak("welcome", t("hello"), lang), 700);
  };

  return (
    <div className="welcome">
      <LangSwitch className="welcome__lang" />
      <div className="welcome__clouds" aria-hidden="true" />

      {stage === 0 ? (
        <section className="welcome__stage">
          <img className="welcome__logo" src="/img/logo/logo-stacked.png" alt="NASJ نسج" />
          <p className="welcome__title">
            <span lang="ar" dir="rtl">{arDict.welcomeTitle}</span>
            <span lang="fr" dir="ltr">{frDict.welcomeTitle}</span>
          </p>
          <MascotBody height={230} className="welcome__mascot" />
          <button type="button" className="play-btn" onClick={begin} aria-label={t("start")}>
            <Icon name="play" size={44} />
          </button>
          <small className="welcome__hint">{t("start")}</small>
        </section>
      ) : (
        <section className="welcome__stage welcome__stage--hello">
          <div className="speech speech--big">
            <p lang="ar" dir="rtl">{arDict.hello}</p>
            <p lang="fr" dir="ltr">{frDict.hello}</p>
          </div>
          <MascotBody height={280} className="welcome__mascot welcome__mascot--hop" />
          <div className="speech speech--soft">
            <p lang="ar" dir="rtl">{arDict.letsGo}</p>
            <p lang="fr" dir="ltr">{frDict.letsGo}</p>
          </div>
          <Btn size="lg" onClick={() => nav(token ? "/children" : "/login")}>
            {t("letsGoButton")} <Icon name="back" className="flip-fwd" />
          </Btn>
          <div className="welcome__family" aria-hidden="true">
            {FAMILY.map((f) => (
              <FamilyPortrait key={f} who={f} size={54} />
            ))}
            <MascotFace mood="celebrating" size={54} />
          </div>
        </section>
      )}
    </div>
  );
}
