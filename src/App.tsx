import { useEffect, type ReactNode } from "react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { EmoteLayer, ToastLayer } from "@/components/Overlays";
import { initApp } from "@/game/controller";
import { useGame } from "@/game/store";
import { sound } from "@/lib/sound";
import HomeScreen from "@/screens/HomeScreen";
import LobbyScreen from "@/screens/LobbyScreen";
import MatchEndScreen from "@/screens/MatchEndScreen";
import PlayScreen from "@/screens/PlayScreen";
import PreparingScreen from "@/screens/PreparingScreen";
import SoloScreen from "@/screens/SoloScreen";
import { ConnectingScreen } from "@/screens/shared";

export default function App() {
  const screen = useGame((s) => s.screen);
  const phase = useGame((s) => s.match?.phase ?? null);

  useEffect(() => {
    initApp();
    const unlock = () => sound.unlock();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const racing = screen === "room" && (phase === "countdown" || phase === "playing" || phase === "roundEnd");

  let content: ReactNode;
  if (screen === "solo") content = <SoloScreen />;
  else if (screen === "room") {
    if (!phase) content = <ConnectingScreen />;
    else if (phase === "lobby") content = <LobbyScreen />;
    else if (phase === "preparing") content = <PreparingScreen />;
    else if (phase === "matchEnd") content = <MatchEndScreen />;
    else content = <PlayScreen />;
  } else content = <HomeScreen />;

  return (
    <div dir="rtl" className="relative min-h-[100dvh] overflow-x-hidden">
      <AmbientBackground calm={racing || screen === "solo"} />
      <div className="relative z-10">{content}</div>
      <EmoteLayer />
      <ToastLayer />
    </div>
  );
}
