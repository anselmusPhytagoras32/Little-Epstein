"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, Compass, Flame, Settings2, UsersRound, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { useGame } from "./game-provider";
import Onboarding from "./onboarding";
import AppStartupLoader from "./app-startup-loader";

const tabs = [
  { href: "/", label: "Escape", icon: Compass },
  { href: "/streak", label: "Streak", icon: Flame },
  { href: "/crew", label: "Crew", icon: UsersRound },
  { href: "/settings", label: "Settings", icon: Settings2 },
];

const onboardingKey = "escape-onboarding-v1";
const onboardingChangeEvent = "escape-onboarding-change";

function subscribeToOnboarding(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(onboardingChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(onboardingChangeEvent, callback);
  };
}

function getOnboardingSnapshot() {
  try { return localStorage.getItem(onboardingKey) === "done"; }
  catch { return false; }
}

function getOnboardingServerSnapshot() {
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const game = useGame();
  const onboardingDone = useSyncExternalStore(subscribeToOnboarding, getOnboardingSnapshot, getOnboardingServerSnapshot);
  const { notice, setNotice } = game;
  const main = useRef<HTMLElement>(null);
  const mapPage = pathname === "/";
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5200);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);
  useEffect(() => {
    const invitation = new URLSearchParams(location.search).get("invite");
    if (pathname === "/" && invitation && /^[A-Za-z0-9_-]{32,64}$/.test(invitation)) router.replace(`/rooms/join?invite=${encodeURIComponent(invitation)}`);
  }, [pathname, router]);

  function navigateOffline(event: MouseEvent<HTMLDivElement>) {
    if (navigator.onLine || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest("a") : null;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const destination = new URL(anchor.href, location.href);
    if (destination.origin !== location.origin || destination.hash) return;
    event.preventDefault();
    location.assign(destination.href);
  }

  function finishOnboarding(destination: string) {
    try { localStorage.setItem(onboardingKey, "done"); } catch { /* Continue for this session. */ }
    window.dispatchEvent(new Event(onboardingChangeEvent));
    router.push(destination);
  }

  if (pathname.startsWith("/boss")) return <>{children}</>;
  if (onboardingDone === null || (!onboardingDone && !game.ready)) return <AppStartupLoader />;
  if (!onboardingDone) return <div className="app-shell"><Onboarding onFinish={finishOnboarding} /></div>;

  return <div className="app-shell" onClickCapture={navigateOffline}>
    <a className="skip-link" href="#page-content">Skip to content</a>
    {!game.online && <div className="connection-banner" role="status"><WifiOff size={14}/> Offline. Online check-ins need a connection.</div>}
    <main ref={main} id="page-content" className={`page-main${mapPage ? " is-map" : ""}`} tabIndex={-1}>{children}</main>
    <nav className="app-tabbar" aria-label="Main navigation">{tabs.map(({ href, label, icon: Icon }) => {
      const active = href === "/" ? mapPage : pathname.startsWith(href);
      return <Link key={href} href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon size={21}/><span>{label}</span></Link>;
    })}</nav>
    {game.notice && <div className="notice" role="status"><Check size={18}/><p>{game.notice}</p><button onClick={() => game.setNotice("")} className="icon-button" aria-label="Dismiss notification"><X size={17}/></button></div>}
  </div>;
}
