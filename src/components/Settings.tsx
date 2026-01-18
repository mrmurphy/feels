import { useState, useRef } from 'react';
import { db, getNextColor, exportData, importData, DEFAULT_COLORS, updateSettings } from '../db';
import { GoogleSyncSection } from './GoogleSyncSection';
import type { Stat, Settings as SettingsType } from '../types';

interface SettingsProps {
  stats: Stat[];
  settings: SettingsType;
}

export function Settings({ stats, settings }: SettingsProps) {
  const [newStatName, setNewStatName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [exportedData, setExportedData] = useState('');
  const [importError, setImportError] = useState('');
  const [daysToShow, setDaysToShow] = useState(settings.daysToShow);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddStat = async () => {
    if (!newStatName.trim()) return;

    const maxOrder = stats.length > 0 ? Math.max(...stats.map((s) => s.order)) : -1;

    await db.stats.add({
      name: newStatName.trim().toLowerCase(),
      color: getNextColor(stats),
      order: maxOrder + 1,
    } as never);

    setNewStatName('');
  };

  const handleEditStart = (stat: Stat) => {
    setEditingId(stat.id!);
    setEditName(stat.name);
    setEditColor(stat.color);
  };

  const handleEditSave = async () => {
    if (!editingId || !editName.trim()) return;
    await db.stats.update(editingId, {
      name: editName.trim().toLowerCase(),
      color: editColor,
    });
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    // Delete stat and all its entries
    await db.transaction('rw', [db.stats, db.entries], async () => {
      await db.entries.where('statId').equals(id).delete();
      await db.stats.delete(id);
    });
    setEditingId(null);
  };

  const handleDaysChange = async (value: number) => {
    setDaysToShow(value);
    await updateSettings({ daysToShow: value });
  };

  const handleExport = async () => {
    const data = await exportData();
    setExportedData(data);
    setShowExport(true);
  };

  const handleCopyExport = () => {
    navigator.clipboard.writeText(exportedData);
  };

  const handleDownloadExport = () => {
    const blob = new Blob([exportedData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feels-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importData(text);
      setImportError('');
      e.target.value = '';
    } catch {
      setImportError('failed to import: invalid file format');
    }
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <h2 className="settings-title">stats</h2>

        <div className="stat-list">
          {stats.map((stat, index) => (
            <div
              key={stat.id}
              className={`stat-item ${editingId === stat.id ? 'editing' : ''}`}
              style={{ '--stagger': index } as React.CSSProperties}
            >
              {editingId === stat.id ? (
                <div className="stat-edit">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="stat-name-input"
                    autoFocus
                  />
                  <div className="color-picker">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        className={`color-option ${editColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditColor(color)}
                      />
                    ))}
                  </div>
                  <div className="stat-edit-actions">
                    <button className="edit-btn save" onClick={handleEditSave}>
                      save
                    </button>
                    <button className="edit-btn cancel" onClick={() => setEditingId(null)}>
                      cancel
                    </button>
                    <button
                      className="edit-btn delete"
                      onClick={() => handleDelete(stat.id!)}
                    >
                      delete
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="stat-display"
                  onClick={() => handleEditStart(stat)}
                >
                  <span
                    className="stat-color-dot"
                    style={{ backgroundColor: stat.color }}
                  />
                  <span className="stat-name">{stat.name}</span>
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="add-stat">
          <input
            type="text"
            value={newStatName}
            onChange={(e) => setNewStatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddStat()}
            placeholder="new stat name..."
            className="add-stat-input"
          />
          <button
            className="add-stat-btn"
            onClick={handleAddStat}
            disabled={!newStatName.trim()}
          >
            add
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-title">chart</h2>

        <div className="setting-row">
          <label className="setting-label">visible days (scroll for more)</label>
          <div className="setting-control">
            <input
              type="range"
              min="7"
              max="90"
              value={daysToShow}
              onChange={(e) => handleDaysChange(Number(e.target.value))}
              className="setting-slider"
            />
            <span className="setting-value">{daysToShow}</span>
          </div>
        </div>
      </section>

      <GoogleSyncSection settings={settings} />

      <section className="settings-section">
        <h2 className="settings-title">data</h2>

        <div className="data-actions">
          <button className="data-btn" onClick={handleExport}>
            export data
          </button>
          <button className="data-btn" onClick={handleImportClick}>
            import data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
        </div>

        {importError && <p className="import-error">{importError}</p>}

        {showExport && (
          <div className="export-modal">
            <div className="export-content">
              <textarea
                readOnly
                value={exportedData}
                className="export-textarea"
              />
              <div className="export-actions">
                <button className="export-btn" onClick={handleCopyExport}>
                  copy
                </button>
                <button className="export-btn" onClick={handleDownloadExport}>
                  download
                </button>
                <button
                  className="export-btn close"
                  onClick={() => setShowExport(false)}
                >
                  close
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
