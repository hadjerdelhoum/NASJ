import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../app/api";
import { useAuth } from "../../app/state";
import { Btn } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { Key } from "../../i18n/dictionary";
import { MascotFace } from "../mascot/Mascot";
import { LangSwitch } from "../settings/LangSwitch";

export function authErrorKey(e: unknown): Key {
  if (e instanceof ApiError) {
    if (e.status === 0) return "errNetwork";
    if (e.status === 401) return "errBadLogin";
    if (e.status === 409) return "errEmailTaken";
    if (e.status === 400) return "errValidation";
    if (e.status === 429) return "errTooMany";
  }
  return "errGeneric";
}

export function LoginPage() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = mode === "login" ? await api.login(email.trim(), password) : await api.register(email.trim(), password);
      signIn(r.token);
      nav("/children", { replace: true });
    } catch (err) {
      setError(authErrorKey(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <LangSwitch className="welcome__lang" />
      <form className="card auth__card" onSubmit={submit} noValidate>
        <img className="auth__logo" src="/img/logo/logo-horizontal.png" alt="NASJ نسج" />
        <MascotFace mood={error ? "oops" : "happy"} size={86} />
        <h1>{mode === "login" ? t("loginTitle") : t("registerTitle")}</h1>

        <label className="field">
          <span>{t("email")}</span>
          <input type="email" inputMode="email" autoComplete="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("password")}</span>
          <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {mode === "register" && <small>{t("passwordHint")}</small>}
        </label>

        {error && <p className="form-error" role="alert">{t(error)}</p>}

        <Btn type="submit" size="lg" disabled={busy || !email || password.length < 8}>
          {mode === "login" ? t("login") : t("register")}
        </Btn>
        <button type="button" className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
          {mode === "login" ? t("noAccount") : t("haveAccount")}
        </button>
      </form>
    </div>
  );
}
