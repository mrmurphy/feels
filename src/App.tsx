import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, initializeDatabase, DEFAULT_SETTINGS } from "./db";
import { QuickEntry } from "./components/QuickEntry";
import { Chart } from "./components/Chart";
import { History } from "./components/History";
import { Settings } from "./components/Settings";
import { ConflictDialog } from "./components/ConflictDialog";
import { useAutoSync } from "./hooks/useAutoSync";
import { useGoogleAuth } from "./google/GoogleAuthContext";
import { performSync } from "./google/syncService";
import type { Settings as SettingsType } from "./types";
import type { SyncResult, ConflictResolution } from "./google/types";
import "./index.css";

type View = "home" | "history" | "settings";

function App() {
  const [view, setView] = useState<View>("home");
  const [dbReady, setDbReady] = useState(false);
  const [conflictResult, setConflictResult] = useState<SyncResult | null>(null);

  const { getValidAccessToken } = useGoogleAuth();

  const stats = useLiveQuery(() => db.stats.orderBy("order").toArray());
  const entries = useLiveQuery(() =>
    db.entries.orderBy("createdAt").reverse().toArray(),
  );
  const settingsData = useLiveQuery(() => db.settings.toCollection().first());

  // Auto-sync with conflict callback
  useAutoSync((result) => setConflictResult(result));

  const handleConflictResolution = async (resolution: ConflictResolution) => {
    setConflictResult(null);
    const token = await getValidAccessToken();
    if (token) {
      await performSync(token, resolution);
    }
  };

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  if (!dbReady || !stats || !entries || settingsData === undefined) {
    return (
      <div className="app loading">
        <div className="loading-text">loading...</div>
      </div>
    );
  }

  const settings: SettingsType = settingsData || {
    daysToShow: DEFAULT_SETTINGS.daysToShow,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <div className="app">
      <header className="header">
        <h1 className="logo">~feels</h1>
      </header>

      <main className="main">
        {view === "home" && (
          <div className="home-view">
            <QuickEntry stats={stats} settings={settings} />
            <Chart
              stats={stats}
              entries={entries}
              visibleDays={settings.daysToShow}
            />
          </div>
        )}
        {view === "history" && <History stats={stats} entries={entries} />}
        {view === "settings" && <Settings stats={stats} settings={settings} />}
      </main>

      <nav className="nav">
        <button
          className={`nav-btn ${view === "home" ? "active" : ""}`}
          onClick={() => setView("home")}
        >
          <span className="nav-icon">+</span>
          <span className="nav-label">record</span>
        </button>
        <button
          className={`nav-btn ${view === "history" ? "active" : ""}`}
          onClick={() => setView("history")}
        >
          <span className="nav-icon">~</span>
          <span className="nav-label">history</span>
        </button>
        <button
          className={`nav-btn ${view === "settings" ? "active" : ""}`}
          onClick={() => setView("settings")}
        >
          <span className="nav-icon">*</span>
          <span className="nav-label">settings</span>
        </button>
      </nav>

      {conflictResult && (
        <ConflictDialog
          cloudDate={conflictResult.cloudBackup?.metadata.exportedAt}
          localEntryCount={conflictResult.localBackup?.metadata.entryCount}
          cloudEntryCount={conflictResult.cloudBackup?.metadata.entryCount}
          onResolve={handleConflictResolution}
          onCancel={() => setConflictResult(null)}
        />
      )}
    </div>
  );
}

export default App;
