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
  ArrowUpRight,
  ArrowDownRight,
  GripVertical,
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
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const filteredStrategies = strategies.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      strategyStore.reorderStrategies(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

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
    <div className="flex h-full flex-col bg-surface">
      {/* Başlık */}
      <div className="border-b border-line px-3 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-medium text-content-strong">Stratejiler</h2>
            <span className="font-mono text-2xs text-content-faint">{strategies.length}</span>
          </div>
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 rounded-md bg-accent-400 px-2.5 py-1.5 text-xs font-medium text-ink-950 transition-colors ease-out hover:bg-accent-300"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Yeni
          </button>
        </div>

        {/* Arama */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-faint"
            strokeWidth={1.75}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Strateji ara"
            aria-label="Strateji ara"
            className="w-full rounded-md border border-line-strong bg-surface-raised py-1.5 pl-8 pr-3 text-xs text-content outline-none transition-colors ease-out placeholder:text-content-faint hover:border-ink-500 focus:border-accent-500"
          />
        </div>
      </div>

      {/* Liste.
          Kart yerine düz satır: panel zaten bir kart, içine kart koymak ikinci
          bir çerçeve demekti. Satır yüksekliği düştü, aynı ekranda iki kat
          strateji görünüyor. */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isLoading ? (
          /* Spinner yerine iskelet: liste satırlarının nereye geleceğini
             gösterir, boşluk zıplamaz. */
          <div className="space-y-px p-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse py-2.5">
                <div className="h-3 w-2/3 rounded-sm bg-ink-750" />
                <div className="mt-2 h-2.5 w-1/3 rounded-sm bg-ink-800" />
              </div>
            ))}
          </div>
        ) : filteredStrategies.length === 0 ? (
          <div className="px-4 py-10">
            <p className="text-sm text-content-muted">
              {searchQuery ? 'Eşleşen strateji yok' : 'Henüz strateji yok'}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-content-faint">
              {searchQuery
                ? 'Arama terimini kısaltmayı deneyin.'
                : 'Yukarıdaki “Yeni” ile bir kural ağacı oluşturun; kaydettikten sonra geçmiş veride test edebilirsiniz.'}
            </p>
          </div>
        ) : (
          filteredStrategies.map((strategy, index) => {
            const isActive = strategy.id === activeStrategyId;
            const isDeleting = deletingId === strategy.id;
            const isDragged = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            const entryCount = strategy.entry_rules?.conditions?.length || 0;
            const exitCount = strategy.exit_rules?.conditions?.length || 0;
            const paramCount = strategy.parameters?.length || 0;
            const tfCount = strategy.timeframe_filters?.length || 0;

            return (
              <div
                key={strategy.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={() => {
                  setDraggedIndex(null);
                  setDragOverIndex(null);
                }}
                onClick={() => onSelect(strategy)}
                className={`group relative cursor-pointer border-b border-line-subtle py-2.5 pl-4 pr-2.5 text-left transition-colors ease-out ${
                  isDragged ? 'opacity-40' : ''
                } ${isDragOver ? 'shadow-[inset_0_2px_0_0_theme(colors.accent.400)]' : ''} ${
                  isActive ? 'bg-surface-raised' : 'hover:bg-surface-hover'
                }`}
              >
                {isActive && (
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent-400" />
                )}

                <div className="flex items-start gap-1.5">
                  <div
                    className="-ml-1.5 mt-px cursor-grab text-content-faint opacity-0 transition-opacity ease-out hover:text-content-muted active:cursor-grabbing group-hover:opacity-100"
                    title="Sürükleyip bırakarak yerini değiştirin"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GripVertical className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3
                      className={`truncate text-xs ${
                        isActive ? 'text-content-strong' : 'text-content'
                      }`}
                    >
                      {strategy.name}
                    </h3>
                    {strategy.description && (
                      <p className="mt-0.5 truncate text-2xs text-content-faint">
                        {strategy.description}
                      </p>
                    )}

                    {/* Kural sayıları.
                        Yeşil/kırmızı kaldırıldı: "giriş" kâr, "çıkış" zarar
                        demek değil — o iki renk bu üründe yalnızca para
                        anlamına geliyor. Yön bilgisini oklar taşıyor. */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-content-faint">
                      {entryCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ArrowUpRight className="h-3 w-3" strokeWidth={1.75} />
                          {entryCount} giriş
                        </span>
                      )}
                      {exitCount > 0 && (
                        <span className="flex items-center gap-0.5">
                          <ArrowDownRight className="h-3 w-3" strokeWidth={1.75} />
                          {exitCount} çıkış
                        </span>
                      )}
                      {paramCount > 0 && <span>{paramCount} parametre</span>}
                      {tfCount > 0 && <span>{tfCount} TF filtresi</span>}
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-3 w-3" strokeWidth={1.75} />
                        {formatDate(strategy.updated_at)}
                      </span>
                    </div>
                  </div>

                  {/* Aksiyonlar. Silme iki tıklamalı; ilk tıklamadan sonra
                      butonun kendisi "Sil?" yazıyor — ikinci tıklamanın ne
                      yapacağı ipucu balonunda saklı kalmıyor. */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={(e) => handleDuplicate(e, strategy)}
                      aria-label="Stratejiyi kopyala"
                      className="rounded p-1 text-content-faint opacity-0 transition-colors ease-out hover:bg-surface-hover hover:text-content focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
                      title="Kopyala"
                    >
                      <Copy className="h-3 w-3" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, strategy.id)}
                      aria-label={isDeleting ? 'Silmeyi onayla' : 'Stratejiyi sil'}
                      className={`flex items-center gap-1 rounded px-1 py-1 transition-colors ease-out ${
                        isDeleting
                          ? 'bg-loss-900 text-loss-300'
                          : 'text-content-faint opacity-0 hover:bg-loss-950 hover:text-loss-400 focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100'
                      }`}
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                      {isDeleting && <span className="text-2xs">Sil?</span>}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}