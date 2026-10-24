import { useEffect, useState } from "react";
import type { Story } from "../../app/types";
import { Btn } from "../../components/ui";
import { Icon } from "../../components/Icon";
import { useI18n } from "../../i18n";
import { audio } from "../audio/audioService";
import { MascotFace } from "../mascot/Mascot";

/** Structured scenes (art + bilingual text + narration key) read like a picture book. Content comes from the database. */
export function StoryReader({ story, narrate, onFinish }: { story: Story; narrate?: boolean; onFinish: () => void }) {
  const { t, lang } = useI18n();
  const [i, setI] = useState(0);
  const scene = story.scenes[i];
  const last = i === story.scenes.length - 1;
  const main = scene[lang];
  const other = scene[lang === "fr" ? "ar" : "fr"];

  // Narrate each page: a recorded file when one is registered for scene.audio, else the device voice.
  useEffect(() => {
    void audio.speak(scene.audio, main, lang, { manual: narrate });
    return () => audio.stopSpeech();
  }, [i, scene.audio, main, lang, narrate]);

  return (
    <section className="story">
      <h1 className="story__title" lang={lang}>{lang === "fr" ? story.title_fr : story.title_ar}</h1>
      <div className="story__book">
        <div className="story__art" aria-hidden="true">{scene.art}</div>
        <p className="story__text" lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>{main}</p>
        <p className="story__text story__text--alt" lang={lang === "fr" ? "ar" : "fr"} dir={lang === "fr" ? "rtl" : "ltr"}>{other}</p>
      </div>
      <div className="story__dots" aria-hidden="true">
        {story.scenes.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "past" : ""} />)}
      </div>
      <div className="story__nav">
        <Btn variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)} aria-label={t("prevPage")}>
          <Icon name="back" className="flip-rtl" />
        </Btn>
        <Btn variant="ghost" onClick={() => void audio.speak(scene.audio, main, lang, { manual: true })} aria-label={t("listen")}>
          <Icon name="speaker" /> {t("listen")}
        </Btn>
        {last ? (
          <Btn onClick={onFinish}><MascotFace mood="celebrating" size={30} /> {t("endStory")}</Btn>
        ) : (
          <Btn onClick={() => setI(i + 1)} aria-label={t("nextPage")}>
            <Icon name="back" className="flip-fwd" />
          </Btn>
        )}
      </div>
    </section>
  );
}
