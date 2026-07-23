/**
 * StrategyList — Kayıtlı strateji listesi.
 *
 * Kart görünümünde stratejiler, arama, oluştur/düzenle/sil/kopyala aksiyonları.
 */

import { useState } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Copy,
  Clock,
  ChevronRight,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
} from 'lucide-react';
import type { Strategy } from '../types/strategy';
import { strategyStore } from '../store/strategyStore';

interface StrategyListProps {
  strategies: Strategy[];
  activeStrategyId: string | null;
  onSelect: (strategy: Strategy) => void;
  onNew: () => void;
  isLoading: boolean;
}

export default function StrategyList({
  strategies,
  activeStrategyId,
  onSelect,
  onNew,
  isLoading,
}: StrategyListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredStrategies = strategies.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (deletingId === id) {
      // İkinci tıklama: sil
      await strategyStore.deleteStrategy(id);
      setDeletingId(null);
    } else {
      // İlk tıklama: onay bekle
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, strategy: Strategy) => {
    e.stopPropagation();
    await strategyStore.createStrategy({
      name: `${strategy.name} (Kopya)`,
      description: strategy.description,
      parameters: strategy.parameters,
      entry_rules: strategy.entry_rules,
      exit_rules: strategy.exit_rules,
      timeframe_filters: strategy.timeframe_filters,
    });
  };


  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#070b13]">
      {/* Başlık */}
      <div className="px-4 py-3 border-b border-slate-800/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-100">Stratejiler</h2>
            <span className="text-[10px] text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded font-mono">
              {strategies.length}
            </span>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-3.5 h-3.5" />
            Yeni
          </button>
        </div>

        {/* Arama */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Strateji ara..."
            className="w-full bg-slate-900/80 border border-slate-700/60 text-slate-200 text-xs rounded-lg pl-8 pr-3 py-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-colors placeholder:text-slate-600"
          />
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className="text-center py-12">
            <Zap className="w-8 h-8 text-slate-700 mx-auto mb-3" />
            <p className="text-xs text-slate-500 mb-1">
              {searchQuery ? 'Sonuç bulunamadı' : 'Henüz strateji yok'}
            </p>
            {!searchQuery && (
              <p className="text-[10px] text-slate-600">
                "Yeni" butonuna tıklayarak ilk stratejinizi oluşturun
              </p>
            )}
          </div>
        ) : (
          filteredStrategies.map((strategy) => {
            const isActive = strategy.id === activeStrategyId;
            const isDeleting = deletingId === strategy.id;
            const entryCount = strategy.entry_rules?.conditions?.length || 0;
            const exitCount = strategy.exit_rules?.conditions?.length || 0;
            const paramCount = strategy.parameters?.length || 0;
            const tfCount = strategy.timeframe_filters?.length || 0;

            return (
              <button
                key={strategy.id}
                onClick={() => onSelect(strategy)}
                className={`w-full text-left p-3 rounded-xl border transition-all group ${
                  isActive
                    ? 'bg-indigo-950/40 border-indigo-600/50 shadow-lg shadow-indigo-500/10'
                    : 'bg-slate-900/40 border-slate-800/40 hover:bg-slate-800/40 hover:border-slate-700/60'
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-xs font-semibold truncate ${
                        isActive ? 'text-indigo-200' : 'text-slate-200'
                      }`}
                    >
                      {strategy.name}
                    </h3>
                    {strategy.description && (
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {strategy.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 transition-transform ${
                      isActive ? 'text-indigo-400 rotate-90' : 'text-slate-600 group-hover:text-slate-400'
                    }`}
                  />
                </div>

                {/* Metrikler */}
                <div className="flex items-center gap-3 mb-2">
                  {entryCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
                      <ArrowUpRight className="w-3 h-3" />
                      {entryCount} giriş
                    </span>
                  )}
                  {exitCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-red-400/70">
                      <ArrowDownRight className="w-3 h-3" />
                      {exitCount} çıkış
                    </span>
                  )}
                  {paramCount > 0 && (
                    <span className="text-[10px] text-slate-500">{paramCount} param</span>
                  )}
                  {tfCount > 0 && (
                    <span className="text-[10px] text-amber-400/60">{tfCount} TF filtre</span>
                  )}
                </div>

                {/* Alt bilgi */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] text-slate-600">
                    <Clock className="w-3 h-3" />
                    {formatDate(strategy.updated_at)}
                  </span>

                  {/* Aksiyonlar */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => handleDuplicate(e, strategy)}
                      className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 rounded transition-all"
                      title="Kopyala"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, strategy.id)}
                      className={`p-1 rounded transition-all ${
                        isDeleting
                          ? 'text-red-400 bg-red-500/20'
                          : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                      }`}
                      title={isDeleting ? 'Silmek için tekrar tıkla' : 'Sil'}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}