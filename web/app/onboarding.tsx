"use client";

import { ArrowLeft, ArrowRight, Check, UsersRound } from "lucide-react";
import { useState } from "react";
import { PlayerAvatar } from "./avatar";
import { useGame } from "./game-provider";

type Choice = "solo" | "crew";

export default function Onboarding({ onFinish }: { onFinish: (destination: string) => void }) {
  const game = useGame();
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<Choice | null>(null);

  function later() {
    onFinish("/");
  }

  return <main className={`onboarding onboarding-step-${step}`} aria-labelledby="onboarding-title">
    <div className="onboarding-top">
      {step > 0 ? <button className="onboarding-back" onClick={() => setStep(step - 1)} aria-label="Go back"><ArrowLeft size={21} /></button> : <span className="onboarding-brand">THE ESCAPE</span>}
      <span className="onboarding-step-label">{step + 1} / 3</span>
    </div>
    <div className="onboarding-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
      <span style={{ width: `${(step + 1) / 3 * 100}%` }} />
    </div>

    {step === 0 ? <div className="onboarding-content onboarding-welcome">
      <div className="onboarding-copy"><h1 id="onboarding-title">30 days.<br />One way out.</h1><p>Check in honestly each day. Stay in the run and reach the boat.</p></div>
      <div className="onboarding-hero" aria-hidden="true"><span className="mascot-portrait mascot-hungry" /><span className="onboarding-hero-note">HE&apos;S WAITING</span></div>
      <div className="onboarding-footer"><button className="onboarding-primary" onClick={() => setStep(1)}>Let&apos;s go <ArrowRight size={20} /></button><p>For adults 18 and older</p></div>
    </div> : step === 1 ? <div className="onboarding-content onboarding-choose">
      <div className="onboarding-copy"><h1 id="onboarding-title">How will you escape?</h1><p>Choose how you&apos;d like to start.</p></div>
      <div className="onboarding-choices">
        <button className="onboarding-choice" onClick={() => { setChoice("solo"); setStep(2); }}>
          <span className="onboarding-choice-art solo-art"><PlayerAvatar avatarId="fern" accent="leaf" size={72} /></span>
          <span className="onboarding-choice-copy"><strong>Go solo</strong><small>Practice on this device</small></span><ArrowRight size={20} />
        </button>
        <button className="onboarding-choice" onClick={() => { setChoice("crew"); setStep(2); }}>
          <span className="onboarding-choice-art crew-art"><PlayerAvatar avatarId="fern" accent="leaf" size={46} /><PlayerAvatar avatarId="coral" accent="sun" size={46} /></span>
          <span className="onboarding-choice-copy"><strong>With my crew</strong><small>Escape with friends</small></span><ArrowRight size={20} />
        </button>
      </div>
      <p className="onboarding-hint">You can change your mind later.</p>
    </div> : <div className="onboarding-content onboarding-account">
      <div className="onboarding-copy"><h1 id="onboarding-title">{game.mode === "online" ? "You’re ready to go." : choice === "crew" ? "Bring your crew along." : "Make it yours."}</h1><p>{game.mode === "online" ? "Your account is ready for the escape." : choice === "crew" ? "Create an account to join or invite friends to a private room." : "Create an account now, or start a solo practice on this device."}</p></div>
      <div className="onboarding-account-art" aria-hidden="true"><span className="mascot-portrait mascot-neutral" /><span className="onboarding-account-icon">{choice === "crew" ? <UsersRound size={28} /> : <Check size={28} />}</span></div>
      <div className="onboarding-footer">
        {game.mode === "online" ? <button className="onboarding-primary" onClick={() => onFinish(choice === "crew" ? "/crew" : "/")}>Continue <ArrowRight size={20} /></button> : <><button className="onboarding-primary" onClick={() => onFinish("/account/register")}>Create account <ArrowRight size={20} /></button><button className="onboarding-later" onClick={later}>Do this later · Start solo practice</button><button className="onboarding-signin" onClick={() => onFinish("/account/sign-in")}>Already have an account? Sign in</button></>}
      </div>
    </div>}
  </main>;
}
