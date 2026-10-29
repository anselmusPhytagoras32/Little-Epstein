"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useGame } from "./game-provider";
import "./app-startup-loader.css";

const CRITICAL_ASSETS = [
  { url: "/images/island-board-v2.webp", label: "island map & checkpoints" },
  { url: "/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.webp", label: "swimmer avatars" },
  { url: "/images/mascot.webp", label: "island pursuer" },
  { url: "/images/escape-island.webp", label: "island overview" },
];

const PRELOAD_STORAGE_KEY = "escape_assets_preloaded_v1";

export default function AppStartupLoader() {
  const game = useGame();
  const [mounted, setMounted] = useState(true);
  const [progress, setProgress] = useState(15);
  const [statusMessage, setStatusMessage] = useState("Scouting the shoreline…");
  const [fading, setFading] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    const alreadyPreloaded = (() => {
      try {
        return sessionStorage.getItem(PRELOAD_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    })();

    let isCancelled = false;
    let loadedCount = 0;
    const totalCount = CRITICAL_ASSETS.length;

    const labels = [
      "Scouting the shoreline…",
      "Mascot spotted in the distance…",
      "Charting escape checkpoints…",
      "Readying your swimmer…",
    ];

    const updateStep = (count: number) => {
      if (isCancelled || completedRef.current) return;
      const targetProgress = Math.min(95, Math.round((count / totalCount) * 80) + 15);
      setProgress(targetProgress);
      setStatusMessage(labels[count - 1] || "Preparing island route…");
    };

    const finishLoading = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setProgress(100);
      setStatusMessage("Go, go, go!");
      try {
        sessionStorage.setItem(PRELOAD_STORAGE_KEY, "true");
      } catch {
        /* storage may be blocked */
      }

      const fadeTimer = window.setTimeout(() => {
        if (isCancelled) return;
        setFading(true);
        const unmountTimer = window.setTimeout(() => {
          if (isCancelled) return;
          setMounted(false);
        }, 420);
        return () => window.clearTimeout(unmountTimer);
      }, alreadyPreloaded ? 80 : 350);

      return () => window.clearTimeout(fadeTimer);
    };

    // Safety timeout: never hang the app if a network connection drops
    const safetyTimer = window.setTimeout(() => {
      if (!completedRef.current) {
        finishLoading();
      }
    }, 2800);

    const preloadImage = (src: string): Promise<void> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (typeof img.decode === "function") {
            img.decode().catch(() => {}).finally(() => {
              loadedCount++;
              updateStep(loadedCount);
              resolve();
            });
          } else {
            loadedCount++;
            updateStep(loadedCount);
            resolve();
          }
        };
        img.onerror = () => {
          loadedCount++;
          resolve();
        };
        img.src = src;
        if (img.complete && img.naturalWidth > 0) {
          if (typeof img.decode === "function") {
            img.decode().catch(() => {}).finally(() => {
              loadedCount++;
              updateStep(loadedCount);
              resolve();
            });
          } else {
            loadedCount++;
            updateStep(loadedCount);
            resolve();
          }
        }
      });
    };

    Promise.all(CRITICAL_ASSETS.map((asset) => preloadImage(asset.url)))
      .then(() => {
        if (!isCancelled) {
          finishLoading();
        }
      })
      .catch(() => {
        if (!isCancelled) {
          finishLoading();
        }
      });

    return () => {
      isCancelled = true;
      window.clearTimeout(safetyTimer);
    };
  }, [game.ready]);

  if (!mounted) return null;

  const containerStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))",
    background: "radial-gradient(circle at 50% 34%, #124c55 0%, #0b343b 52%, #062024 100%)",
    color: "#fcfaf4",
    opacity: fading ? 0 : 1,
    transform: fading ? "scale(1.02)" : "scale(1)",
    pointerEvents: fading ? "none" : "auto",
    transition: "opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1), transform 0.38s cubic-bezier(0.16, 1, 0.3, 1)",
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: "border-box",
  };

  return (
    <div
      className={`startup-loader${fading ? " is-fading" : ""}`}
      style={containerStyle}
      role="status"
      aria-live="polite"
      aria-label="Loading Escape the Epstein assets"
    >
      <div
        className="startup-loader-content"
        style={{
          width: "100%",
          maxWidth: 340,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 22,
        }}
      >
        {/* Mascot Centerpiece */}
        <div
          className="loader-mascot-wrap"
          style={{
            position: "relative",
            width: 124,
            height: 124,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="loader-mascot-portrait"
            style={{
              width: 114,
              height: 114,
              aspectRatio: "1",
              borderRadius: "50%",
              border: "4px solid #f9d779",
              boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45), 0 0 0 3px #062a2f",
              backgroundImage: "url(/images/mascot.webp)",
              backgroundRepeat: "no-repeat",
              backgroundSize: "300% 200%",
              backgroundPosition: "50% 100%",
              flexShrink: 0,
              display: "block",
            }}
            role="img"
            aria-label="The Island Mascot"
          />
          <span
            className="loader-mascot-alert"
            style={{
              position: "absolute",
              bottom: -4,
              right: -8,
              background: "#dc2626",
              color: "#ffffff",
              border: "2px solid #ffffff",
              borderRadius: 6,
              padding: "3px 9px",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.05em",
              transform: "rotate(4deg)",
              boxShadow: "0 4px 10px rgba(0, 0, 0, 0.4)",
              whiteSpace: "nowrap",
            }}
          >
            HE&apos;S WAITING
          </span>
        </div>

        {/* Brand Title matching Game Theme */}
        <div
          className="startup-copy"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <h1
            className="startup-title"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#fcfaf4",
              margin: 0,
              textShadow: "0 2px 10px rgba(0, 0, 0, 0.4)",
              textTransform: "uppercase",
            }}
          >
            ESCAPE THE EPSTEIN
          </h1>
          <p
            className="startup-subtitle"
            style={{
              fontSize: 14,
              color: "#a1cca6",
              fontWeight: 600,
              margin: 0,
            }}
          >
            Stay alive. Reach the boat.
          </p>
        </div>

        {/* Game Themed Progress Bar */}
        <div
          className="startup-progress-section"
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            className="startup-progress-header"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 13,
              padding: "0 2px",
            }}
          >
            <span
              className="startup-status-text"
              style={{
                color: "#dff0dc",
                fontWeight: 700,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 250,
              }}
            >
              {statusMessage}
            </span>
            <span
              className="startup-percentage"
              style={{
                color: "#f9d779",
                fontWeight: 900,
              }}
            >
              {progress}%
            </span>
          </div>

          <div
            className="startup-track"
            style={{
              width: "100%",
              height: 12,
              borderRadius: 999,
              background: "#072327",
              border: "2px solid #145058",
              overflow: "hidden",
              boxShadow: "inset 0 2px 4px rgba(0, 0, 0, 0.5)",
              position: "relative",
            }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Island route loading progress"
          >
            <div
              className="startup-fill"
              style={{
                width: "100%",
                height: "100%",
                background: "#f9d779",
                borderRadius: 999,
                transformOrigin: "left center",
                transform: `scaleX(${progress / 100})`,
                transition: "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
                boxShadow: "0 2px 0 #b38b28",
              }}
            />
          </div>

          <div
            className="startup-hint"
            style={{
              fontSize: 11,
              color: "#80bca5",
              fontWeight: 600,
              minHeight: 18,
            }}
          >
            {progress >= 100 ? "Island route unlocked" : "November Survival · 30-Day Escape Challenge"}
          </div>
        </div>
      </div>
    </div>
  );
}
